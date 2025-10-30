# LI.FI Fee Collector Scanner - REST API Documentation

## 🚀 Quick Start

Start the application:
```bash
npm run dev
```

The API will be available at: `http://localhost:3000`

---

## 📚 API Endpoints

### 1. Health Check
**GET** `/api/health`

Returns the health status of the application, including database connectivity and scanner progress.

**Response Example:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "mongodb": "connected",
  "scanner": {
    "polygon": {
      "lastScannedBlock": 65000000,
      "latestBlockNumber": 65000100,
      "blocksBehind": 100,
      "progressPercent": "99.98%",
      "status": "scanning",
      "lastScanTimestamp": "2024-01-15T10:29:00.000Z",
      "lastError": null
    }
  }
}
```

---

### 2. Query Events
**GET** `/api/events`

Retrieves fee collection events with flexible filtering and pagination.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `integrator` | string | No | - | Filter by integrator address (case-insensitive) |
| `chain` | string | No | `polygon` | Filter by blockchain |
| `token` | string | No | - | Filter by token address (case-insensitive) |
| `fromBlock` | number | No | - | Filter events from this block onwards |
| `toBlock` | number | No | - | Filter events up to this block |
| `limit` | number | No | `100` | Max results (max: 1000) |
| `offset` | number | No | `0` | Pagination offset |
| `sortBy` | string | No | `blockNumber` | Field to sort by |
| `sortOrder` | string | No | `desc` | Sort order: `asc` or `desc` |

#### Examples

**Get all events for a specific integrator:**
```bash
curl "http://localhost:3000/api/events?integrator=0x1234567890abcdef"
```

**Get events from a specific block range:**
```bash
curl "http://localhost:3000/api/events?fromBlock=64000000&toBlock=65000000"
```

**Get recent events with pagination:**
```bash
curl "http://localhost:3000/api/events?limit=50&offset=0&sortOrder=desc"
```

**Get events for a specific token:**
```bash
curl "http://localhost:3000/api/events?token=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
```

**Complex query (integrator + token + time range):**
```bash
curl "http://localhost:3000/api/events?integrator=0x1234...&token=0x5678...&fromBlock=64000000&limit=100"
```

#### Response Example
```json
{
  "success": true,
  "data": [
    {
      "_id": "65a1234567890abcdef12345",
      "chain": "polygon",
      "transactionHash": "0xabc123...",
      "blockNumber": 64500000,
      "blockTimestamp": 1705320000,
      "logIndex": 15,
      "token": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "integrator": "0x1234567890abcdef1234567890abcdef12345678",
      "integratorFee": "1000000",
      "lifiFee": "500000",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1523,
    "limit": 100,
    "offset": 0,
    "count": 100,
    "hasMore": true
  },
  "filter": {
    "chain": "polygon",
    "integrator": "0x1234567890abcdef1234567890abcdef12345678",
    "token": null,
    "fromBlock": null,
    "toBlock": null
  }
}
```

---

### 3. List All Integrators
**GET** `/api/events/integrators`

Returns a list of all unique integrators with event counts and statistics.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `chain` | string | No | `polygon` | Filter by blockchain |

#### Example
```bash
curl "http://localhost:3000/api/events/integrators"
```

#### Response Example
```json
{
  "success": true,
  "data": [
    {
      "integrator": "0x1234567890abcdef1234567890abcdef12345678",
      "eventCount": 1523,
      "firstSeen": 1704067200,
      "lastSeen": 1705320000,
      "tokenCount": 15
    },
    {
      "integrator": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      "eventCount": 892,
      "firstSeen": 1704153600,
      "lastSeen": 1705319000,
      "tokenCount": 8
    }
  ],
  "count": 2,
  "chain": "polygon"
}
```

---

### 4. Event Statistics
**GET** `/api/events/stats`

Returns aggregated statistics about fee collection events.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `integrator` | string | No | - | Filter by integrator address |
| `chain` | string | No | `polygon` | Filter by blockchain |

#### Example
```bash
curl "http://localhost:3000/api/events/stats"
```

#### Response Example
```json
{
  "success": true,
  "data": {
    "totalEvents": 15234,
    "uniqueIntegratorsCount": 42,
    "uniqueTokensCount": 87,
    "earliestBlock": 60000000,
    "latestBlock": 65000000,
    "earliestTimestamp": 1700000000,
    "latestTimestamp": 1705320000
  },
  "filter": {
    "chain": "polygon",
    "integrator": null
  }
}
```

---

### 5. Get Event by ID
**GET** `/api/events/:id`

Retrieves a specific event by its MongoDB document ID.

#### Example
```bash
curl "http://localhost:3000/api/events/65a1234567890abcdef12345"
```

#### Response Example
```json
{
  "success": true,
  "data": {
    "_id": "65a1234567890abcdef12345",
    "chain": "polygon",
    "transactionHash": "0xabc123...",
    "blockNumber": 64500000,
    "blockTimestamp": 1705320000,
    "logIndex": 15,
    "token": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "integrator": "0x1234567890abcdef1234567890abcdef12345678",
    "integratorFee": "1000000",
    "lifiFee": "500000",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  }
}
```

---

### 6. API Root
**GET** `/`

Returns API documentation and available endpoints.

#### Example
```bash
curl "http://localhost:3000/"
```

---

## 🔍 Common Use Cases

### 1. Monitor a Specific Integrator
```bash
# Get all events for an integrator
curl "http://localhost:3000/api/events?integrator=0x1234...&sortOrder=desc"

# Get stats for an integrator
curl "http://localhost:3000/api/events/stats?integrator=0x1234..."
```

### 2. Track Recent Activity
```bash
# Get latest 50 events
curl "http://localhost:3000/api/events?limit=50&sortOrder=desc"

# Get events from last hour (assuming ~1800 blocks/hour on Polygon)
LATEST_BLOCK=$(curl -s "http://localhost:3000/api/health" | jq '.scanner.polygon.latestBlockNumber')
FROM_BLOCK=$((LATEST_BLOCK - 1800))
curl "http://localhost:3000/api/events?fromBlock=$FROM_BLOCK"
```

### 3. Analyze Integrator Distribution
```bash
# Get all integrators sorted by activity
curl "http://localhost:3000/api/events/integrators"
```

### 4. Historical Analysis
```bash
# Events from a specific time period (block range)
curl "http://localhost:3000/api/events?fromBlock=60000000&toBlock=61000000&limit=1000"
```

---

## ⚡ Performance Tips

1. **Use pagination** for large result sets (limit + offset)
2. **Narrow your queries** with filters (integrator, token, block range)
3. **Sort efficiently** - sorting by indexed fields (blockNumber, integrator) is faster
4. **Cache responses** if your use case allows it
5. **Monitor via /api/health** to ensure scanner is keeping up

---

## 🛡️ Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error description",
  "message": "Detailed error message"
}
```

Common HTTP status codes:
- `200` - Success
- `404` - Resource not found
- `500` - Internal server error
- `503` - Service unavailable (e.g., database disconnected)

---

## 🔗 CORS

The API includes CORS headers and can be accessed from browser applications:
```javascript
fetch('http://localhost:3000/api/events?integrator=0x1234...')
  .then(res => res.json())
  .then(data => console.log(data))
```

---

## 📊 Data Format Notes

- **Addresses**: All addresses are stored and returned in lowercase for consistency
- **Fees**: Stored as strings to preserve precision (BigNumber values)
- **Timestamps**: Block timestamps are Unix timestamps (seconds since epoch)
- **Block Numbers**: Regular JavaScript numbers (safe up to 2^53-1)

---

## 🧪 Testing the API

You can test the API using:
- **curl** (examples above)
- **Postman** or **Insomnia**
- **Browser** (GET requests only)
- **HTTPie**: `http localhost:3000/api/events integrator==0x1234...`

---

## 🚦 Rate Limiting

Currently, no rate limiting is implemented. For production deployment, consider adding:
- Express rate limiting middleware
- API key authentication
- Request throttling per IP/user

