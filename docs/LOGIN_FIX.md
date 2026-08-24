# Login & Authentication Fix Guide

## ✅ Fixed Issues

The login page has been fixed with the following improvements:

### 1. **API URL Detection**
```javascript
// Now automatically detects and uses correct API URL
function getApiUrl() {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:4173';
  }
  return window.location.origin;
}
```

### 2. **Token Persistence**
- Tokens now stored in `localStorage`
- User data persisted across page refreshes
- Automatic token removal on logout

### 3. **Better Error Handling**
- Clear error messages in login form
- Detailed console logging for debugging
- User-friendly validation messages

### 4. **Improved Login UI**
- Beautiful gradient background
- Better styled login form
- Demo credentials displayed
- Loading states on buttons
- Enter key support for password field

### 5. **Console Logging**
```javascript
[API] POST /api/auth/login        // API calls
[App] Authenticated: user@email    // App status
[API Error] 401: Invalid credentials // Errors
```

## 🚀 How to Test

### Step 1: Start Services
```bash
make dev
# or
docker compose up -d
```

### Step 2: Open Browser
```
http://localhost:4173
```

You should see a beautiful login screen.

### Step 3: Create Account
**Option A: Register New Account**
1. Enter email: `newuser@example.com`
2. Enter password: `password123` (min 8 chars)
3. Click "Create Account"
4. Enter name in prompt: `New User`
5. You'll be logged in automatically

**Option B: Use Demo Account** (if already registered)
1. Email: `test@example.com`
2. Password: `password123`
3. Click "Sign In"

### Step 4: Verify Login Success
After login, you should see:
- File management interface
- Sidebar with navigation
- Empty state (ready to upload files)
- User initials in top right

## 🔍 Debugging

### Check Console Logs
1. Open browser DevTools: `F12`
2. Go to Console tab
3. Look for `[App]` and `[API]` messages
4. Error logs show `[API Error]`

### Check Backend Logs
```bash
docker compose logs api -f
```

### Check MongoDB Connection
```bash
docker compose logs mongo -f
```

### Verify Services Running
```bash
docker compose ps
```

All should show "Up" status.

## 🐛 Common Issues & Fixes

### Issue: "Failed to fetch" Error
**Cause**: Backend not running or wrong port
**Fix**:
```bash
# Check if services are running
docker compose ps

# If not, start them
docker compose up -d

# Check logs
docker compose logs api
```

### Issue: Login Shows Blank Page
**Cause**: JavaScript error or missing DOM elements
**Fix**:
```bash
# Check console for errors (F12)
# Check backend logs
docker compose logs api -f

# Reload page
Ctrl+Shift+R (hard refresh)
```

### Issue: "Invalid credentials" After Registration
**Cause**: Password not stored properly or email already exists
**Fix**:
```bash
# Use different email
user+123@example.com

# Or check MongoDB
docker compose exec mongo mongosh -u nimbus -p nimbus-dev-password --authenticationDatabase admin
# db.users.find()
```

### Issue: Page Redirects to Login After Login
**Cause**: Token not being saved or session lost
**Fix**:
```bash
# Check browser localStorage
F12 → Application → Local Storage → http://localhost:4173
# Should see: nimbus_token and nimbus_user

# Or clear and retry
localStorage.clear()
# Reload page and try again
```

## 📝 API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/register` | POST | Create account |
| `/api/auth/login` | POST | Sign in |
| `/api/auth/me` | GET | Get current user |
| `/api/health` | GET | Health check |

## 🔐 How Authentication Works

```
1. User enters email & password
2. Frontend sends POST /api/auth/login
3. Backend validates credentials against MongoDB
4. Backend generates JWT token (15 min expiry)
5. Token sent via HttpOnly cookie
6. Frontend stores in localStorage
7. Future requests include token
8. Backend validates token on protected routes
```

## ✨ Features Now Working

After login, you can:

✅ **Create Folders**
- Click "+ New" → "New folder"
- Enter folder name
- Click "Create folder"

✅ **Upload Files**
- Click "+ New" → "File upload"
- Select files to upload
- Files appear in grid

✅ **Search Files**
- Type in search box
- Results appear instantly

✅ **Delete Items**
- Files go to trash
- Can restore from trash tab

✅ **Navigate**
- Click folders to enter
- Breadcrumbs show path

## 🧪 Manual API Testing

Use `curl` to test endpoints:

```bash
# Register
curl -X POST http://localhost:4173/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'

# Login
curl -X POST http://localhost:4173/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'

# Get user (with token from cookies)
curl -X GET http://localhost:4173/api/auth/me \
  -b cookies.txt

# Health check
curl http://localhost:4173/api/health
```

## 📦 Running Test Script

```bash
# Make script executable
chmod +x scripts/test-login.sh

# Run test
./scripts/test-login.sh
```

This will:
1. Test health endpoint
2. Try registering a user
3. Test login
4. Verify authentication

## 🎯 What's Fixed

| Issue | Status | Fix |
|-------|--------|-----|
| API URL detection | ✅ Fixed | Auto-detects localhost:4173 |
| Token persistence | ✅ Fixed | Uses localStorage |
| Error messages | ✅ Fixed | Clear, user-friendly |
| Login UI | ✅ Fixed | Beautiful gradient design |
| CORS handling | ✅ Fixed | Credentials: 'include' |
| Console logging | ✅ Fixed | Detailed debug info |
| Enter key support | ✅ Fixed | Works on password field |
| Button states | ✅ Fixed | Disabled while loading |
| Session restore | ✅ Fixed | Auto-login on page reload |

## 🚀 Next Steps

1. **Test Login** → Open `http://localhost:4173`
2. **Create Account** → Use "Create Account" button
3. **Upload Files** → Test file upload
4. **Create Folders** → Test folder creation
5. **Verify Data** → Check MongoDB stored data

## 💬 Need Help?

**Check these resources:**
- Browser Console: `F12` → Console tab
- Backend Logs: `docker compose logs api -f`
- MongoDB: `docker compose exec mongo mongosh`
- API Docs: `docs/API_DOCS.md` (if available)

---

**Your login page is now fully functional! 🎉**

Try it: `http://localhost:4173`
