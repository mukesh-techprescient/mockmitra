import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import TestIntro from './pages/TestIntro.jsx';
import Exam from './pages/Exam.jsx';
import Review from './pages/Review.jsx';
import History from './pages/History.jsx';
import AdminHome from './pages/admin/AdminHome.jsx';
import Categories from './pages/admin/Categories.jsx';
import Upload from './pages/admin/Upload.jsx';
import TestPreview from './pages/admin/TestPreview.jsx';
import { Spinner } from './components/ui.jsx';
import './styles.css';

function Guard({ admin, children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* full-screen exam, no top nav */}
          <Route path="/exam/:testId" element={<Guard><Exam /></Guard>} />
          <Route element={<Guard><Layout /></Guard>}>
            <Route index element={<Dashboard />} />
            <Route path="/tests/:testId" element={<TestIntro />} />
            <Route path="/results/:attemptId" element={<Review />} />
            <Route path="/history" element={<History />} />
            <Route path="/admin" element={<Guard admin><AdminHome /></Guard>} />
            <Route path="/admin/categories" element={<Guard admin><Categories /></Guard>} />
            <Route path="/admin/upload" element={<Guard admin><Upload /></Guard>} />
            <Route path="/admin/upload/:replaceId" element={<Guard admin><Upload /></Guard>} />
            <Route path="/admin/tests/:id" element={<Guard admin><TestPreview /></Guard>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
