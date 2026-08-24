# QUICK START - Login Fixed ✅

## 🚀 Your Nimbus Drive is Ready!

Services are now running. Follow these simple steps:

### Step 1: Open Browser

Go to: **`http://localhost:4173`**

You should see a beautiful login screen with:
- Email input field
- Password input field
- "Sign In" button
- "Create Account" button
- Demo credentials hint

### Step 2: Create Your Account

**Option A: Register New Account** (Recommended)

1. Enter email: `yourname@example.com`
2. Enter password: `password123` (min 8 chars)
3. Click **"Create Account"**
4. Enter your name in the prompt
5. Click OK
6. ✅ You're logged in! You'll see the file management interface

**Option B: Create Demo Account**

1. Enter email: `test@example.com`
2. Enter password: `password123`
3. Click **"Create Account"**
4. Enter name: `Demo User`
5. Click OK

### Step 3: You're In!

After login, you'll see:
- **Sidebar** - Navigation menu
- **Search box** - Search files
- **+ New Folder** - Create folder
- **⬆️ Upload** - Upload files
- **My Drive** - Your files
- **Trash** - Deleted items
- **Logout** - Sign out

### Step 4: Test Features

**Create a Folder:**
1. Click **"+ New Folder"**
2. Enter folder name
3. Click OK
4. Folder appears in grid

**Upload a File:**
1. Click **"⬆️ Upload"**
2. Select a file from your computer
3. File uploads and appears in grid

**Search Files:**
1. Type in search box
2. Results appear instantly
3. Click to open or download

**Delete to Trash:**
1. Files appear in grid
2. Right-click and delete (or just try clicking)
3. Goes to Trash tab

## 🐛 Troubleshooting

### Login Page Doesn't Load

**Solution:**
```bash
# Make sure services are running
docker compose ps

# If not running, start them
docker compose up -d

# Check logs
docker compose logs api
```

### Login Button Doesn't Work

**Solution:**
1. Open browser DevTools: **F12**
2. Go to **Console** tab
3. Look for error messages
4. Try creating a NEW account instead of logging in

### "Email already exists" Error

**Solution:**
Use a different email:
- `test2@example.com`
- `myuser@example.com`
- etc.

### Still Not Working?

1. **Check if API is running:**
   ```bash
   docker compose exec -T api node -e "console.log('API is running')"
   ```

2. **Check MongoDB:**
   ```bash
   docker compose logs mongo
   ```

3. **Restart everything:**
   ```bash
   docker compose down
   docker compose up -d
   ```

4. **Clear browser cache:**
   - Ctrl+Shift+Delete (or Cmd+Shift+Delete on Mac)
   - Clear cookies and localStorage
   - Reload page

## 📝 Demo Credentials (after first setup)

Email: `test@example.com`  
Password: `password123`

## ✨ Features Available

After login:

- ✅ Create folders
- ✅ Upload files (up to 100MB)
- ✅ Download files
- ✅ Search files
- ✅ Delete & restore from trash
- ✅ View user profile
- ✅ Logout

## 🔍 Developer Console

Open DevTools (F12) → Console tab to see debug messages:

```
[App] Init called
[API] Login: test@example.com
[API OK] POST /api/auth/login
[App] User authenticated: test@example.com
```

This helps identify issues if login fails.

## 📱 Mobile Access

The app works on mobile too! Open `http://localhost:4173` on your phone.

(Note: File uploads are limited by browser capabilities)

## 🔐 Your Data

- Files stored in MongoDB
- Passwords encrypted (Bcryptjs)
- Sessions last 15 minutes
- Data persists after logout

## 📞 Need Help?

1. Check console for errors (F12)
2. Check backend logs: `docker compose logs api -f`
3. Check database: `docker compose exec mongo mongosh`
4. Restart services: `docker compose restart`

---

**Ready? Open `http://localhost:4173` now!** 🚀
