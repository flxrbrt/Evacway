# EvacWay System Structure Guide

This guide summarizes EvacWay's user roles, major use cases, application context, data movement, system flow, and functional decomposition. It is based on the current React frontend, Flask API, and SQLAlchemy data model. It is intended as a system overview, not a substitute for endpoint-level authorization rules.

## 1. Scope and role names

| Guide role | Application role | Meaning |
| --- | --- | --- |
| Admin | `admin` | System administrator with user, reference-data, import/export, and emergency operations access. |
| Staff | `lgu_personnel` | LGU operations personnel who manage evacuation and response workflows. |
| Resident | `resident` | Authenticated resident account linked to a resident record. |
| Guest | Unauthenticated visitor | Anyone using the public landing page and public map without signing in. |

Guest access is limited to public information and account entry points. The public map is open, while hazard and rescue submission actions prompt for sign-in. Route and record access still depends on backend authorization; hiding a screen in the frontend is not the security boundary.

## 2. Use case guide

### Use case diagram

```mermaid
flowchart LR
    Guest([Guest])
    Resident([Resident])
    Staff([Staff / LGU personnel])
    Admin([Admin])

    subgraph EvacWay[EvacWay]
      UC1([View public map and evacuation centers])
      UC2([View hazards and road conditions])
      UC3([View evacuation route guidance])
      UC4([Register or sign in])
      UC5([Submit hazard report])
      UC6([Request rescue assistance])
      UC7([Manage own profile and household])
      UC8([Review residents and registration requests])
      UC9([Manage centers, buildings, rooms and assignments])
      UC10([Check in and track evacuees])
      UC11([Review hazards and rescue requests])
      UC12([Manage users and system reference data])
      UC13([Import or export system data])
      UC14([Review notifications and activity])
    end

    Guest --> UC1
    Guest --> UC2
    Guest --> UC3
    Guest --> UC4
    Guest -. sign-in required .-> UC5
    Guest -. sign-in required .-> UC6
    Resident --> UC1
    Resident --> UC2
    Resident --> UC3
    Resident --> UC5
    Resident --> UC6
    Resident --> UC7
    Staff --> UC8
    Staff --> UC9
    Staff --> UC10
    Staff --> UC11
    Staff --> UC14
    Admin --> UC8
    Admin --> UC9
    Admin --> UC10
    Admin --> UC11
    Admin --> UC12
    Admin --> UC13
    Admin --> UC14
```

### Use case descriptions

| Use case | Primary actor | Main flow | Result |
| --- | --- | --- | --- |
| View public map | Guest, Resident | Open the public map; inspect centers, hazard zones/reports, roads and map details. | Current public map information is displayed. |
| Find a route | Guest, Resident | Choose or provide a location and destination; request route guidance. | A route is displayed when a valid route can be calculated. |
| Register / sign in | Guest, Resident | Submit registration or credentials; complete account setup when prompted. | A resident can access authenticated resident features after account approval/setup. |
| Report a hazard | Resident | Sign in, provide a location and report details, optionally attach photos, then submit. | A report is stored for staff review; review may update hazard/road state. |
| Request rescue | Resident | Sign in, provide request details and location, then submit. | Staff can see and update the rescue request. |
| Manage evacuation operations | Staff | Review resident registrations; maintain households and centers; assign/check in evacuees; respond to reports and requests. | Operational records and response status are updated. |
| Administer EvacWay | Admin | Perform staff operations plus manage users and reference data and run supported imports/exports. | System setup data and administrative records are maintained. |

Use case coverage follows current visible routes and API role decorators. A feature's exact scope can vary by endpoint; consult the route implementation when changing permissions.

## 3. Context diagram

```mermaid
flowchart LR
    Guest[Guest / public visitor]
    Resident[Resident account]
    Staff[LGU staff]
    Admin[Administrator]

    System((EvacWay platform\nReact web app + Flask API))
    DB[(PostgreSQL / PostGIS)]
    Media[(Uploaded report and rescue media)]
    Mail[SMTP email service]
    Push[Web push service]

    Guest -->|Public map queries, signup, public requests| System
    System -->|Map, center, hazard and route information| Guest
    Resident -->|Credentials, profile, hazard/rescue reports, route requests| System
    System -->|Account, map, route and request status| Resident
    Staff -->|Operations updates, check-in, reviews| System
    System -->|Dashboards, resident and incident queues| Staff
    Admin -->|User, configuration, import/export and operations| System
    System -->|Administrative views and status| Admin
    System <-->|Operational records, spatial data, accounts and logs| DB
    System <-->|Uploaded and retrieved media| Media
    System -->|Account setup and notification email| Mail
    System -->|Staff web-push notifications| Push
```

SMTP and web-push are optional integration points configured by deployment settings. The diagram shows logical dependencies; it does not promise delivery when an integration is unconfigured or unavailable.

## 4. Data flow diagram (level 1)

```mermaid
flowchart LR
    G[Guest]
    R[Resident]
    S[Staff]
    A[Admin]

    P1((1.0 Identity and access))
    P2((2.0 Public map and routing))
    P3((3.0 Resident reports and requests))
    P4((4.0 Evacuation operations))
    P5((5.0 Administration and reference data))
    P6((6.0 Notifications and audit))

    D1[(D1 Accounts and resident records)]
    D2[(D2 Centers, buildings, rooms and assignments)]
    D3[(D3 Hazards, reports, roads and rescue requests)]
    D4[(D4 Notifications and system logs)]
    D5[(D5 Uploaded media)]

    G -->|Sign up / public queries| P1
    R -->|Login / account actions| P1
    P1 <--> D1
    P1 -->|Session / authorization result| R
    P1 -->|Account setup event| P6

    G -->|Map / route query| P2
    R -->|Map / route query| P2
    P2 -->|Center and route data| D2
    P2 -->|Hazard and road data| D3
    P2 -->|Public map / route response| G
    P2 -->|Map / route response| R

    R -->|Hazard or rescue submission| P3
    P3 <--> D3
    P3 -->|Photo / attachment| D5
    P3 -->|New incident event| P6
    P3 -->|Submission status| R

    S -->|Resident, center, assignment and check-in updates| P4
    A -->|Operations updates| P4
    P4 <--> D1
    P4 <--> D2
    P4 <--> D3
    P4 -->|Review/status event| P6
    P4 -->|Operational views| S
    P4 -->|Operational views| A

    A -->|User, lookup, import/export actions| P5
    P5 <--> D1
    P5 <--> D2
    P5 -->|Administrative event| P6

    P6 <--> D4
    P6 -->|Email / web-push when configured| S
    P6 -->|Account email when configured| R
```

The stores above are conceptual groups of tables and uploaded files, not literal database schemas. The current model includes users and resident accounts, residents and families, evacuation centers/buildings/rooms/assignments, hazard zones/reports/photos, roads, rescue requests, notifications, and system logs.

## 5. System flowchart

```mermaid
flowchart TD
    Start([Start]) --> Open[Open EvacWay]
    Open --> Public{Public page or map?}
    Public -->|Yes| PublicView[Load public map and reference data]
    PublicView --> PublicAction{Choose action}
    PublicAction -->|Browse / route| Query[Send map or route query]
    PublicAction -->|Report / rescue| NeedsAuth[Prompt for sign-in]
    NeedsAuth --> Login
    PublicAction -->|Sign in / register| Login[Authenticate or submit registration]
    Login --> AuthOK{Credentials or registration accepted?}
    AuthOK -->|No| AuthError[Show validation or account status]
    AuthError --> Open
    AuthOK -->|Yes| Role{Resolve account role}
    Role -->|Resident| ResidentView[Open resident map and account features]
    Role -->|Staff| StaffView[Open LGU operations dashboard]
    Role -->|Admin| AdminView[Open admin dashboard]
    ResidentView --> Action{Select feature}
    StaffView --> Action
    AdminView --> Action
    Query --> Validate[Validate input and access]
    Action --> Validate
    Validate --> Valid{Valid and authorized?}
    Valid -->|No| Error[Return clear error / access response]
    Error --> Action
    Valid -->|Yes| Process[Run API workflow]
    Process --> Store[(Read or update database / media)]
    Store --> Event{Notification or audit needed?}
    Event -->|Yes| Notify[Record event; send configured notification]
    Event -->|No| Response[Return API result]
    Notify --> Response
    Response --> Update[Update page or map]
    Update --> Action
```

## 6. Functional decomposition diagram (FDD)

```mermaid
flowchart TD
    Root[EvacWay Emergency Evacuation and Response System]
    Root --> F1[1. Access and accounts]
    Root --> F2[2. Public information and mapping]
    Root --> F3[3. Resident services]
    Root --> F4[4. Evacuation operations]
    Root --> F5[5. Emergency response]
    Root --> F6[6. Administration]
    Root --> F7[7. Notifications and records]

    F1 --> F11[Authenticate users]
    F1 --> F12[Register resident]
    F1 --> F13[Set up / reset password]
    F1 --> F14[Authorize by role]

    F2 --> F21[Display evacuation centers]
    F2 --> F22[Display hazards and roads]
    F2 --> F23[Calculate evacuation route]
    F2 --> F24[Show map details]

    F3 --> F31[Manage resident profile]
    F3 --> F32[View household / center information]
    F3 --> F33[Submit hazard report]
    F3 --> F34[Request rescue assistance]

    F4 --> F41[Review registration requests]
    F4 --> F42[Manage households and residents]
    F4 --> F43[Manage centers, buildings and rooms]
    F4 --> F44[Assign evacuees]
    F4 --> F45[Check in / track evacuees]

    F5 --> F51[Review hazard reports]
    F5 --> F52[Validate hazards / road blockage]
    F5 --> F53[Manage rescue requests]
    F5 --> F54[Register non-registered evacuees]

    F6 --> F61[Manage staff accounts]
    F6 --> F62[Manage reference options]
    F6 --> F63[Import / export operational data]
    F6 --> F64[Configure evacuation center data]

    F7 --> F71[Create staff notifications]
    F7 --> F72[Send configured email / web push]
    F7 --> F73[Record system activity]
```

## 7. Main information groups

| Information group | Main entities | Used by |
| --- | --- | --- |
| Identity and residents | Users, resident accounts, residents, families, registration requests | Access, resident services, staff operations |
| Evacuation capacity | Centers, center/barangay links, buildings, rooms, assignments | Public map and staff operations |
| Situational awareness | Hazard zones, hazard reports/photos, road segments | Public map, resident reports, staff review and routing |
| Emergency response | Rescue requests, non-registered evacuees | Resident requests and staff response/check-in |
| System operations | Notifications, push subscriptions, system logs, reference options | Staff/admin workflows |

## 8. Implementation references

- Frontend route and role gates: `frontend/src/App.jsx` and `frontend/src/components/ProtectedRoute/ProtectedRoute.jsx`.
- API route authorization and workflows: `backend/routes/`.
- Persistent entities: `backend/models.py`.
- Runtime service wiring: `backend/app.py`, `docker-compose.yml`.

