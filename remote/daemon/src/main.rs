use std::collections::HashMap;
use std::env;
use std::io::{self, BufRead, BufReader, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const SERVER_PROTOCOL_VERSION: &str = "v1";
const DEFAULT_BIND_ADDR: &str = "127.0.0.1:7443";
const DEFAULT_AUTH_TIMEOUT_SECS: u64 = 20;
const DEFAULT_IDLE_TIMEOUT_SECS: u64 = 90;
const SOCKET_POLL_INTERVAL_MILLIS: u64 = 1000;

#[derive(Clone)]
struct DaemonConfig {
    expected_token: String,
    auth_timeout: Duration,
    idle_timeout: Duration,
}

#[derive(Default)]
struct SessionRegistry {
    control_sessions: HashMap<String, ControlSession>,
    remote_sessions: HashMap<String, String>,
}

#[derive(Clone)]
struct ControlSession {
    last_connection_id: String,
    last_seen_unix_ms: u128,
}

impl SessionRegistry {
    fn touch_control_session(&mut self, control_session_id: &str, connection_id: &str) {
        self.control_sessions.insert(
            String::from(control_session_id),
            ControlSession {
                last_connection_id: String::from(connection_id),
                last_seen_unix_ms: unix_time_ms(),
            },
        );
    }

    fn has_control_session(&self, control_session_id: &str) -> bool {
        self.control_sessions.contains_key(control_session_id)
    }

    fn register_remote_session(&mut self, remote_session_id: &str, control_session_id: &str) {
        self.remote_sessions.insert(
            String::from(remote_session_id),
            String::from(control_session_id),
        );
    }

    fn can_resume_remote_session(&self, remote_session_id: &str, control_session_id: &str) -> bool {
        matches!(
            self.remote_sessions.get(remote_session_id),
            Some(owner) if owner == control_session_id
        )
    }

    fn control_connection_id(&self, control_session_id: &str) -> Option<String> {
        self.control_sessions
            .get(control_session_id)
            .map(|session| session.last_connection_id.clone())
    }

    fn control_last_seen(&self, control_session_id: &str) -> Option<u128> {
        self.control_sessions
            .get(control_session_id)
            .map(|session| session.last_seen_unix_ms)
    }
}

fn main() -> io::Result<()> {
    let bind_addr = env::var("AIH_REMOTE_BIND").unwrap_or_else(|_| String::from(DEFAULT_BIND_ADDR));
    let expected_token = env::var("AIH_REMOTE_AUTH_TOKEN").unwrap_or_default();
    let auth_timeout = read_env_u64("AIH_REMOTE_AUTH_TIMEOUT_SECS", DEFAULT_AUTH_TIMEOUT_SECS);
    let idle_timeout = read_env_u64("AIH_REMOTE_IDLE_TIMEOUT_SECS", DEFAULT_IDLE_TIMEOUT_SECS);

    let config = Arc::new(DaemonConfig {
        expected_token,
        auth_timeout: Duration::from_secs(auth_timeout),
        idle_timeout: Duration::from_secs(idle_timeout),
    });

    let listener = TcpListener::bind(&bind_addr)?;
    let sequence = Arc::new(AtomicU64::new(1));
    let sessions = Arc::new(Mutex::new(SessionRegistry::default()));

    println!(
        "[aih-remote-daemon] listening on {} (protocol={}, auth_token={})",
        bind_addr,
        SERVER_PROTOCOL_VERSION,
        if config.expected_token.is_empty() {
            "required-from-client"
        } else {
            "configured"
        }
    );

    for incoming in listener.incoming() {
        match incoming {
            Ok(stream) => {
                let cfg = Arc::clone(&config);
                let seq = Arc::clone(&sequence);
                let session_store = Arc::clone(&sessions);
                thread::spawn(move || {
                    if let Err(err) = handle_connection(stream, cfg, seq, session_store) {
                        eprintln!("[aih-remote-daemon] connection error: {}", err);
                    }
                });
            }
            Err(err) => {
                eprintln!("[aih-remote-daemon] accept error: {}", err);
            }
        }
    }

    Ok(())
}

fn handle_connection(
    mut stream: TcpStream,
    config: Arc<DaemonConfig>,
    sequence: Arc<AtomicU64>,
    sessions: Arc<Mutex<SessionRegistry>>,
) -> io::Result<()> {
    let conn_id = format!("conn-{}", sequence.fetch_add(1, Ordering::Relaxed));
    let peer = stream.peer_addr().ok();
    stream.set_nodelay(true)?;
    stream.set_read_timeout(Some(Duration::from_millis(SOCKET_POLL_INTERVAL_MILLIS)))?;

    write_line(
        &mut stream,
        &format!("SERVER_HELLO {} {}", SERVER_PROTOCOL_VERSION, conn_id),
    )?;

    let mut reader = BufReader::new(stream.try_clone()?);
    let mut authenticated = false;
    let mut control_session_id = String::new();
    let auth_deadline = Instant::now() + config.auth_timeout;
    let mut last_activity = Instant::now();

    loop {
        if !authenticated && Instant::now() > auth_deadline {
            write_line(&mut stream, "ERR AUTH_TIMEOUT auth%20window%20expired")?;
            break;
        }

        if Instant::now().duration_since(last_activity) > config.idle_timeout {
            write_line(&mut stream, "ERR IDLE_TIMEOUT idle%20timeout%20reached")?;
            break;
        }

        let mut raw = String::new();
        match reader.read_line(&mut raw) {
            Ok(0) => break,
            Ok(_) => {
                last_activity = Instant::now();
            }
            Err(err)
                if err.kind() == io::ErrorKind::WouldBlock
                    || err.kind() == io::ErrorKind::TimedOut =>
            {
                continue;
            }
            Err(err) => return Err(err),
        }

        let line = raw.trim();
        if line.is_empty() {
            continue;
        }

        let response = process_command(
            line,
            &conn_id,
            &mut authenticated,
            &mut control_session_id,
            &config,
            &sequence,
            &sessions,
        );

        write_line(&mut stream, &response)?;
        if response == "BYE" {
            break;
        }
    }

    log_disconnect(peer);
    Ok(())
}

fn process_command(
    line: &str,
    conn_id: &str,
    authenticated: &mut bool,
    control_session_id: &mut String,
    config: &DaemonConfig,
    sequence: &AtomicU64,
    sessions: &Arc<Mutex<SessionRegistry>>,
) -> String {
    let mut parts = line.split_whitespace();
    let cmd = match parts.next() {
        Some(raw) => raw.to_ascii_uppercase(),
        None => return String::from("ERR BAD_REQUEST empty%20command"),
    };

    match cmd.as_str() {
        "HELLO" => {
            let _client_id = parts.next().map(percent_decode).unwrap_or_default();
            let client_protocol = parts.next().map(percent_decode).unwrap_or_default();
            if client_protocol != SERVER_PROTOCOL_VERSION {
                return String::from("ERR VERSION_MISMATCH expected%20v1");
            }
            format!("HELLO_ACK {} {}", conn_id, SERVER_PROTOCOL_VERSION)
        }
        "AUTH" => {
            let supplied = parts.next().map(percent_decode).unwrap_or_default();
            if !validate_token(&config.expected_token, &supplied) {
                return String::from("ERR AUTH_FAILED token%20invalid");
            }

            let requested_resume_control_session_id =
                parts.next().map(percent_decode).unwrap_or_default();
            let mut registry = match sessions.lock() {
                Ok(guard) => guard,
                Err(_) => return String::from("ERR INTERNAL session%20registry%20lock%20failed"),
            };

            if !requested_resume_control_session_id.is_empty()
                && registry.has_control_session(&requested_resume_control_session_id)
            {
                *authenticated = true;
                *control_session_id = requested_resume_control_session_id;
                registry.touch_control_session(control_session_id, conn_id);
                return format!("AUTH_OK {} RESUMED", percent_encode(control_session_id));
            }

            *authenticated = true;
            let next = sequence.fetch_add(1, Ordering::Relaxed);
            *control_session_id = format!("ctl-{}-{}", unix_time_ms(), next);
            registry.touch_control_session(control_session_id, conn_id);
            format!("AUTH_OK {} NEW", percent_encode(control_session_id))
        }
        "PING" => {
            if !*authenticated {
                return String::from("ERR UNAUTHENTICATED auth%20required");
            }

            let mut reconnect_state = String::from("attached");
            if !control_session_id.is_empty() {
                if let Ok(registry) = sessions.lock() {
                    if let Some(last_conn_id) = registry.control_connection_id(control_session_id) {
                        reconnect_state = if last_conn_id == conn_id {
                            String::from("attached")
                        } else {
                            String::from("resumed")
                        };
                    }
                }
            }

            let last_seen = if control_session_id.is_empty() {
                unix_time_ms()
            } else {
                sessions
                    .lock()
                    .ok()
                    .and_then(|registry| registry.control_last_seen(control_session_id))
                    .unwrap_or_else(unix_time_ms)
            };

            format!("PONG {} {}", last_seen, percent_encode(&reconnect_state))
        }
        "OPEN_SESSION" => {
            if !*authenticated {
                return String::from("ERR UNAUTHENTICATED auth%20required");
            }
            if control_session_id.is_empty() {
                return String::from("ERR INTERNAL missing%20control%20session");
            }

            let target = parts
                .next()
                .map(percent_decode)
                .filter(|v| !v.is_empty())
                .unwrap_or_else(|| String::from("default"));
            let sid = format!(
                "rs-{}-{}",
                unix_time_ms(),
                sequence.fetch_add(1, Ordering::Relaxed)
            );

            let mut registry = match sessions.lock() {
                Ok(guard) => guard,
                Err(_) => return String::from("ERR INTERNAL session%20registry%20lock%20failed"),
            };
            registry.register_remote_session(&sid, control_session_id);
            format!("SESSION_OPEN {} {}", percent_encode(&sid), percent_encode(&target))
        }
        "RESUME_SESSION" => {
            if !*authenticated {
                return String::from("ERR UNAUTHENTICATED auth%20required");
            }
            if control_session_id.is_empty() {
                return String::from("ERR INTERNAL missing%20control%20session");
            }

            let session_id = parts.next().map(percent_decode).unwrap_or_default();
            if session_id.is_empty() {
                return String::from("ERR INVALID_SESSION session%20id%20required");
            }

            let registry = match sessions.lock() {
                Ok(guard) => guard,
                Err(_) => return String::from("ERR INTERNAL session%20registry%20lock%20failed"),
            };

            if registry.can_resume_remote_session(&session_id, control_session_id) {
                return format!("SESSION_RESUMED {}", percent_encode(&session_id));
            }

            String::from("ERR INVALID_SESSION resume%20not%20allowed")
        }
        "CLOSE" => String::from("BYE"),
        _ => String::from("ERR UNKNOWN_COMMAND unsupported%20command"),
    }
}

fn validate_token(expected_token: &str, supplied_token: &str) -> bool {
    if expected_token.is_empty() {
        return !supplied_token.trim().is_empty();
    }
    expected_token == supplied_token
}

fn write_line(stream: &mut TcpStream, message: &str) -> io::Result<()> {
    stream.write_all(message.as_bytes())?;
    stream.write_all(b"\n")?;
    stream.flush()
}

fn log_disconnect(peer: Option<SocketAddr>) {
    if let Some(addr) = peer {
        println!("[aih-remote-daemon] disconnected: {}", addr);
    }
}

fn unix_time_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn read_env_u64(key: &str, default_value: u64) -> u64 {
    env::var(key)
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(default_value)
}

fn percent_encode(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for byte in raw.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            out.push(char::from(byte));
        } else {
            out.push('%');
            out.push(hex_char((byte >> 4) & 0x0f));
            out.push(hex_char(byte & 0x0f));
        }
    }
    out
}

fn percent_decode(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut idx = 0;

    while idx < bytes.len() {
        if bytes[idx] == b'%' && idx + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (from_hex(bytes[idx + 1]), from_hex(bytes[idx + 2])) {
                out.push((high << 4) | low);
                idx += 3;
                continue;
            }
        }

        out.push(bytes[idx]);
        idx += 1;
    }

    String::from_utf8_lossy(&out).into_owned()
}

fn from_hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn hex_char(value: u8) -> char {
    match value {
        0..=9 => (b'0' + value) as char,
        _ => (b'A' + (value - 10)) as char,
    }
}
