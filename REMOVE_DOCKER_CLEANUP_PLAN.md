# Docker Decommission Plan (Auto-generated)

## Backend
- [ ] Delete backend/modules/docker/ and all files
- [ ] Delete backend/modules/apps/ and all files (if apps tied to Docker)
- [ ] Remove Docker and apps route registrations from backend server
- [ ] Remove all Docker/apps imports from backend
- [ ] Remove all references to /api/docker and /api/apps endpoints
- [ ] Delete /etc/nas/containers.json, /etc/nas/app-catalog.json, /etc/nas/installed-apps.json

## Frontend
- [ ] Delete src/pages/Apps/ and all files
- [ ] Delete src/services/docker.service.js and src/services/apps.service.js
- [ ] Delete src/stores/docker.store.js
- [ ] Remove all Docker/apps API calls from src/services/api.js
- [ ] Remove "Apps" from sidebar navigation (Sidebar.jsx)
- [ ] Remove all Docker/apps state from Zustand/Redux
- [ ] Remove all Docker/apps UI components (App cards, container controls, logs viewer)

## Validation
- [ ] Backend starts with no errors
- [ ] Frontend builds successfully
- [ ] No API endpoint references Docker
- [ ] Sidebar has no Apps section
- [ ] No console errors in browser
- [ ] No missing imports or crashes
- [ ] Storage, SMB/NFS features still work

## Final Search
- [ ] Search for "docker", "container", "apps" and remove all active references
