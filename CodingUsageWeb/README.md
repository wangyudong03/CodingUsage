# Coding Usage Web

**Shared Usage Dashboard** - A Demo web platform for CodingUsage.

![Coding Usage Web](docs/screenshot.png)

## Quick Start

### Installation

```bash
cd CodingUsageWeb
npm install
npm start
```

### Database Migration (if upgrading from older version)

If you're upgrading from an older version with existing data, run the migration script:

```bash
node migrate_db.js
```

This will:
- Remove `total_usage`, `used_usage`, `bonus_usage`, `remaining_usage` fields from `cursor_usage_reports` table
- Remove `bonus_usage`, `remaining_usage` fields from `trae_usage_reports` table

### Bind Your API Key

1. Install IDE extension (Search Coding-Usage)
2. Get your client API key from extension settings or use command:
   - Command Palette: "Copy Client API Key"
   - Format: `ck_` + 32-character MD5 hash
3. Visit web dashboard and click "Bind API Key"
4. Paste your key and confirm

## API Endpoints

### Usage Reporting

```bash
# For Cursor
POST /api/cursor-usage
Content-Type: application/json

{
  "client_token": "ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "email": "user@example.com",
  "platform": "darwin",
  "app_name": "Cursor",
  "membership_type": "pro",
  "api_spend": 124200,
  "api_limit": 200000,
  "auto_spend": 0,
  "auto_limit": 0,
  "expire_time": 1735689600000,
  "host": "api.cursor.sh"
}

# For Trae
POST /api/trae-usage
Content-Type: application/json

{
  "client_token": "ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "email": "user@example.com",
  "platform": "darwin",
  "app_name": "Trae",
  "membership_type": "pro",
  "total_usage": 2000,
  "used_usage": 500,
  "expire_time": 1735689600000,
  "host": "api.trae.sh"
}
```

### Health Check

```bash
GET /api/health

Response:
{
  "status": "ok",
  "service": "coding-usage",
  "version": "1.0.0",
  "timestamp": 1735084800000
}
```

### Ping (Keep-Alive)

```bash
POST /api/ping
Content-Type: application/json

{
  "client_token": "ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "active": true
}
```

### Validate API Key

```bash
POST /validate-key
Content-Type: application/json

{
  "api_key": "ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

## Features in Detail

### Public Plaza

- Browse all publicly shared usage statistics
- Grouped by email account (multiple devices aggregated)
- Sort by activity time or usage amount
- Ascending/descending order
- Device count badges
- Real-time online status indicators

### Personal Dashboard

- View your bound API keys across all devices
- Individual device statistics with usage breakdown
- 30-day usage trend charts
- Toggle public/private visibility per key
- One-click unbind functionality
- Device-specific monitoring

### Privacy Controls

- **Private by default**: New keys are private until you enable public sharing
- **Per-key control**: Toggle visibility for each device independently
- **Local storage**: API keys stored in browser localStorage + cookie
- **No registration**: Bind keys without creating accounts

### Usage Statistics

Each card displays:
- Email/account identifier
- Membership type (Free/Pro/Business)
- Expiration date and time
- Total/used/bonus/remaining usage
- Progress bar with color coding:
  - Green: < 70% used
  - Yellow: 70-90% used
  - Red: > 90% used
- Last activity timestamp
- Online/offline status
- Platform logo (Cursor/Trae)
- Device count for multi-device accounts

### Usage Trends

- 30-day historical chart with SVG rendering
- Smooth interpolation for missing days
- Interactive hover states
- Max value indicators
- Auto-scaling Y-axis
- Responsive design

## Troubleshooting

### API Key Not Found

**Symptom**: "API Key not found" error when binding

**Solution**:
1. Ensure IDE extension has reported data at least once
2. Check client API key matches format: `ck_` + 32 chars
3. Verify extension is running and connected

### Usage Data Not Updating

**Symptom**: Statistics not refreshing in dashboard

**Solution**:
1. Check IDE extension ping status (should be green)
2. Verify network connectivity
3. Check browser console for API errors
4. Refresh page to force data reload

### Multiple Devices Not Aggregating

**Symptom**: Same email showing as separate entries

**Solution**:
1. Ensure email is set in extension settings
2. Check that both devices have reported data
3. Verify email matches exactly across devices
4. Wait for next sync cycle (devices update independently)

### Offline Status Always Shown

**Symptom**: Device shows offline despite extension running

**Solution**:
1. Check last ping timestamp (updates every 60 seconds)
2. Verify extension ping is not disabled
3. Check server receives ping requests
4. Offline threshold is 2 minutes of inactivity

## Security Considerations

- API keys are device-specific (hostname + MAC based)
- No authentication required for read-only plaza
- Write operations require valid client API key
- Cookie-based session for bound keys (1 year expiry)
- SQL injection prevention via parameterized queries
- XSS protection through EJS auto-escaping

## Performance Optimization

- SQLite indexes on frequently queried columns
- Smart sync: only queries API when local changes detected
- Debounced ping updates (120 second threshold)
- Efficient aggregation queries for multi-device accounts
- Static asset caching
- Minimal external dependencies

## Related Projects

- **[Cursor Usage Extension](../CursorUsage)**: IDE extension for Cursor/Trae
- **[Browser Extension](../CodingUsageBrowserExtension)**: Automatic token extraction

## License

MIT License - see LICENSE file for details
