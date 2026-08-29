# AFOSI Admin Dashboard

Separate admin application for managing AFOSI website content.

## Features

- **Opportunities Management**: Create, edit, delete, and toggle job opportunities
- **Applications**: Review, categorize (by opportunity type) and download documents from applications submitted through the site's built-in application form — see "Applications tab" below, it's a separate service from the rest of this dashboard
- **Gallery Management**: Upload, edit, and delete gallery images with automatic Supabase Storage integration
- **Real-time Updates**: Changes reflect immediately on the main website
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Setup

### 1. Install Dependencies

```bash
cd ADMIN
npm install
```

### 2. Configure Environment

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_API_URL=http://localhost:5000/api
```

### 3. Start Development Server

```bash
npm run dev
```

The admin dashboard will run on: **http://localhost:3000**

## Production Build

```bash
npm run build
```

The build output will be in the `dist` folder.

## Deployment

### Option 1: Deploy Separately (Recommended)

Deploy the admin dashboard to a separate subdomain:
- Main website: `https://afosi.org`
- Admin dashboard: `https://admin.afosi.org`

Benefits:
- Better security (can add authentication at subdomain level)
- Independent deployments
- Separate SSL certificates

### Option 2: Deploy as Subdirectory

Build and deploy to `/admin` path on main domain:
- Main website: `https://afosi.org`
- Admin dashboard: `https://afosi.org/admin`

## Security Recommendations

### For Production:

1. **Add Authentication**
   - Implement login system
   - Use Supabase Auth or custom auth
   - Protect all admin routes

2. **Update Storage Policies**
   - Replace public policies with authenticated policies
   - See `SUPABASE_STORAGE_SETUP.md` for details

3. **Add Rate Limiting**
   - Already implemented in backend
   - Consider adding frontend rate limiting too

4. **Use HTTPS**
   - Always use HTTPS in production
   - Update CORS settings in backend

5. **Environment Variables**
   - Never commit `.env` files
   - Use environment variables in hosting platform

## Folder Structure

```
ADMIN/
├── public/              # Static assets
├── src/
│   ├── components/
│   │   ├── admin/      # Admin panel components
│   │   └── ui/         # UI components (Button, Badge)
│   ├── lib/            # Utilities
│   ├── services/       # API services
│   ├── utils/          # Helper functions
│   ├── App.tsx         # Main app component
│   ├── main.tsx        # Entry point
│   └── index.css       # Global styles
├── .env.example
├── package.json
├── vite.config.ts
└── README.md
```

## API Endpoints Used

- `GET /api/opportunities` - List opportunities
- `POST /api/opportunities` - Create opportunity
- `PUT /api/opportunities/:id` - Update opportunity
- `DELETE /api/opportunities/:id` - Delete opportunity
- `PATCH /api/opportunities/:id/toggle` - Toggle status

- `GET /api/gallery` - List gallery images
- `POST /api/gallery` - Create gallery entry
- `PUT /api/gallery/:id` - Update gallery entry
- `DELETE /api/gallery/:id` - Delete gallery entry

- `POST /api/upload` - Upload image to Supabase Storage

### Applications tab (separate service — not the Vercel functions above)

Talks directly to `VITE_APPLICATIONS_API_URL` (default `https://api.afosi.org/applications`),
this project's own VPS Express service (`server/applications.js`), **not**
`/api/*` above. Application documents are stored privately on that VPS's
disk, never in the public Supabase Storage buckets the rest of this
dashboard uses.

- `GET /applications?type=&opportunity=` - List/filter/categorize submissions
- `GET /applications/:id/files/:fileKey` - Download one document
- `PATCH /applications/:id/reviewed` - Mark reviewed

These routes require this dashboard's own login JWT — `JWT_SECRET` on that
VPS (`server/.env`) must be set to the **exact same value** as `JWT_SECRET`
in this project's Vercel environment variables (`ADMIN/api/auth.js` issues
the token; `server/applications.js` verifies it). See `server/README.md`.

## Ports

- **Admin Dashboard**: http://localhost:3000
- **Main Website**: http://localhost:8080
- **Backend API**: http://localhost:5000

## Troubleshooting

### Port 3000 already in use

Change port in `vite.config.ts`:
```typescript
server: {
  port: 3001, // Change to any available port
}
```

### Cannot connect to backend

1. Make sure backend is running on port 5000
2. Check `VITE_API_URL` in `.env`
3. Verify CORS settings in backend

### Images not uploading

1. Check Supabase Storage bucket is created
2. Verify storage policies are set
3. Check backend logs for errors

## Support

For detailed setup instructions, see:
- `../BACKEND_SETUP_GUIDE.md` - Backend setup
- `../SUPABASE_STORAGE_SETUP.md` - Storage setup
- `../IMAGE_UPLOAD_QUICK_START.md` - Image upload guide
