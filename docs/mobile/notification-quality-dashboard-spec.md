# Mobile Notification Quality Dashboard Spec

## 1. Goal And Scope
This dashboard tracks push-notification quality for the mobile command center.
It is used by release owners, on-call engineers, and product operations to detect delivery regressions and run incident triage.

In scope:
- Push delivery reliability and timeliness for production traffic.
- Breakdown by platform, app version, region, network, and provider.
- Alerting thresholds and drill-down workflow.

Out of scope:
- Content quality (copywriting, CTR optimization experiments).
- In-app message channels that are not push-based.

## 2. Core Questions
The dashboard must answer:
- Are notifications reaching devices reliably right now?
- Is delivery latency within target for key user journeys?
- Which segment is driving failures or delay spikes?
- Is the issue provider-side, app-side, or network/region specific?

## 3. Data Model And Event Ingestion

### 3.1 Event Sources
Use the analytics taxonomy defined in `docs/mobile/analytics-event-taxonomy.md`.
Required event stream categories:
- `push_send_requested`
- `push_provider_accepted`
- `push_provider_rejected`
- `push_device_delivered`
- `push_opened`
- `push_dropped_or_expired`

### 3.2 Required Dimensions
Every ingested event must include:
- `event_time`
- `notification_id`
- `campaign_or_flow_id`
- `provider` (APNs, FCM, vendor proxy)
- `platform` (iOS, Android)
- `app_version`
- `os_version`
- `region`
- `network_type` (wifi, 4g, 5g, unknown)
- `language_locale`
- `tenant_or_workspace_id` (if multi-tenant)

### 3.3 Data Quality Rules
- Schema compliance >= 99.5% per rolling 1h window.
- Event-time skew <= 120s for 99% of events.
- Duplicate `notification_id + event_type` ratio <= 0.5%.
- Missing critical dimensions ratio <= 0.2%.

## 4. Metrics And SLO-Aligned Targets

### 4.1 Reliability Metrics
- Send acceptance rate = `provider_accepted / send_requested`
- Device delivery rate = `device_delivered / send_requested`
- Provider rejection rate = `provider_rejected / send_requested`
- Drop/expiry rate = `dropped_or_expired / send_requested`

### 4.2 Latency Metrics
- Provider acceptance latency: p50, p95 from `send_requested -> provider_accepted`
- Device delivery latency: p50, p95 from `send_requested -> device_delivered`
- Open latency (diagnostic only): p50, p95 from `device_delivered -> opened`

### 4.3 Baseline Targets (Initial)
- Device delivery rate >= 98.5% (rolling 15m)
- Provider rejection rate <= 0.8% (rolling 15m)
- Device delivery latency p95 <= 45s (rolling 15m)
- Data freshness lag <= 180s for dashboard aggregates

## 5. Alert Thresholds And Policies

### 5.1 Alert Rules
- **P1 Reliability Incident**:
  - device delivery rate < 97.0% for 10 minutes, OR
  - provider rejection rate > 2.0% for 10 minutes.
- **P2 Degradation**:
  - device delivery rate between 97.0% and 98.5% for 15 minutes, OR
  - delivery latency p95 > 60s for 15 minutes.
- **P3 Data Quality Warning**:
  - schema compliance < 99.0% for 15 minutes, OR
  - freshness lag > 5 minutes for 10 minutes.

### 5.2 Routing
- P1: page on-call + notify release owner + open incident room.
- P2: notify mobile reliability channel and create investigation ticket.
- P3: notify telemetry owner; no page by default.

## 6. Dashboard Views

### 6.1 Executive Overview (Default)
- Current health banner (Healthy / Degraded / Incident).
- Last 60m trend for delivery rate and p95 delivery latency.
- Active alerts with severity and impacted segments.

### 6.2 Segment Comparison
Filter/group by:
- platform
- app_version
- region
- provider
- network_type

Shows top regressions by absolute drop and relative delta vs 24h baseline.

### 6.3 Funnel Diagnostics
Notification lifecycle funnel:
- requested -> accepted -> delivered -> opened

Each stage includes conversion, loss count, and loss ratio.

### 6.4 Incident Triage Drill-Down
For any anomalous segment, provide:
- 15m/1h/24h overlays for key metrics.
- provider error code distribution.
- affected app versions and rollout ring.
- correlated backend deploy IDs and feature flags.
- sample trace IDs for deep log lookup.

## 7. Incident Triage Runbook Integration
Minimum triage flow:
1. Confirm alert severity and affected KPI.
2. Isolate segment (platform/version/region/provider/network).
3. Check provider rejection/error code spike.
4. Check recent app/backend release and config changes.
5. Apply rollback / routing fallback if blast radius is growing.
6. Record incident timeline and recovery confirmation.

## 8. Non-Functional Requirements
- Dashboard refresh interval: 1 minute.
- Query response time: p95 <= 3s for default view, <= 8s for drill-down.
- Metric retention: 90 days at 5-minute granularity.
- Access control: release owners + on-call + SRE read access.

## 9. Ownership
- Metric definitions: Mobile Growth + Data Engineering
- Alert policies: Mobile On-call + SRE
- Dashboard maintenance: Observability Platform Team

## 10. Acceptance Mapping
- Event ingestion dimensions and alert thresholds are defined in sections 3 and 5.
- Drill-down views for incident triage are defined in sections 6.4 and 7.
