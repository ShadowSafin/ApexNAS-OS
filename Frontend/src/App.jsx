import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import Storage from './pages/Storage/Storage';

import Filesystems from './pages/Filesystems/Filesystems';
import Shares from './pages/Shares/Shares';
import SMBNFS from './pages/SMBNFS/SMBNFS';
import FTP from './pages/FTP/FTP';
import Users from './pages/Users/Users';
import Groups from './pages/Groups/Groups';
import System from './pages/System/System';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<ProtectedRoute element={<Dashboard />} />} />
          <Route path="/storage" element={<ProtectedRoute element={<Storage />} />} />

          <Route path="/filesystems" element={<ProtectedRoute element={<Filesystems />} />} />
          <Route path="/shares" element={<ProtectedRoute element={<Shares />} />} />
          <Route path="/smb-nfs" element={<ProtectedRoute element={<SMBNFS />} />} />
          <Route path="/ftp" element={<ProtectedRoute element={<FTP />} />} />
          <Route path="/users" element={<ProtectedRoute element={<Users />} />} />
          <Route path="/groups" element={<ProtectedRoute element={<Groups />} />} />
          <Route path="/system" element={<ProtectedRoute element={<System />} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
