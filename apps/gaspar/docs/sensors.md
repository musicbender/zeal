# Sensors

CRUD service for smart home sensors. Sensors represent physical devices in the home — motion detectors, contact sensors, temperature probes, and bed occupancy pads.

## Data Model

```prisma
model Sensor {
  id          String    @id @default(uuid())
  name        String
  type        String    // SensorType enum
  isActive    Boolean
  activeSince DateTime?
  room        String?   // Room enum
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

### `type` values (`SensorType`)

| Value           | Description                   |
| --------------- | ----------------------------- |
| `BED_OCCUPANCY` | Bed pressure sensor           |
| `MOTION`        | PIR motion detector           |
| `CONTACT`       | Door or window contact sensor |
| `TEMPERATURE`   | Temperature probe             |

### `room` values (`Room`)

| Value         |
| ------------- |
| `LIVING_ROOM` |
| `BEDROOM`     |
| `KITCHEN`     |
| `BATHROOM`    |
| `GARAGE`      |
| `OFFICE`      |

## Endpoints

### `POST /sensors`

Create a new sensor.

**Request body:**

```json
{
	"name": "Front door",
	"type": "CONTACT",
	"room": "LIVING_ROOM"
}
```

**Response:** `201` with the created sensor object. `400` on validation error.

---

### `GET /sensors`

List all sensors.

**Response:** `200` with array of sensor objects.

```json
[
	{
		"id": "a1b2c3d4-...",
		"name": "Front door",
		"type": "CONTACT",
		"room": "LIVING_ROOM",
		"isActive": false,
		"activeSince": null,
		"createdAt": "2026-05-10T12:00:00.000Z",
		"updatedAt": "2026-05-10T12:00:00.000Z"
	}
]
```

---

### `GET /sensors/:id`

Get a single sensor by UUID.

**Response:** `200` with sensor object, `404` if not found.

---

### `PATCH /sensors/:id`

Update a sensor. All fields are optional.

**Request body:**

```json
{
	"name": "Back door",
	"isActive": true,
	"room": "KITCHEN"
}
```

**Response:** `200` with updated sensor. `400` on error.

---

### `DELETE /sensors/:id`

Delete a sensor.

**Response:** `204` No Content. `400` on error.
