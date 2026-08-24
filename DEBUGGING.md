# DEBUGGING GUIDE

If registration is failing with "Failed to fetch", follow these steps:

## Step 1: Open Browser Console
- Go to: `http://localhost:4173`
- Press: `F12` to open DevTools
- Go to **Console** tab

## Step 2: Try to Register
- Email: `test@example.com`
- Password: `password123`
- Name: `Demo User`
- Click **Register**

## Step 3: Check Console Logs
You should see logs like:
```
[API] POST /api/auth/register { email: 'test@example.com', ... }
[API Response] Status: 201
[API Data]: { user: { ... } }
```

## If You See Errors:

**"Failed to fetch"** → Network problem
- Services not running: `docker compose ps`
- Restart: `docker compose restart`

**"HTTP 400"** → Validation error
- Check email format
- Check password length (min 8)
- Check name is not empty

**"HTTP 500"** → Server error
- Check API logs: `docker compose logs api -f`
- Check MongoDB: `docker compose logs mongo`

## Test API Directly

Open browser console and run:
```javascript
fetch('http://localhost:4173/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'password123',
    name: 'Demo User'
  })
}).then(r => r.json()).then(console.log).catch(console.error);
```

This will show you the exact error response.

## What to Do:

1. **Go to:** `http://localhost:4173`
2. **Open console:** F12 → Console
3. **Try to register**
4. **Copy the error message**
5. **Tell me what you see**

This will help me debug the issue properly.
