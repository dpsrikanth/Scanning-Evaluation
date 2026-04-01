import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Evaluate from './pages/Evaluate';
import ForgotPassword from './pages/ForgotPassword';
import VerifyOtp from './pages/VerifyOtp';
import ResetPassword from './pages/ResetPassword';
import ChangePassword from './pages/ChangePassword';
import Profile from './pages/Profile';
import HeadEvalLogin from './pages/HeadEvalLogin';
import HeadEvalAssign from './pages/HeadEvalAssign';
import ViewBooklet from './pages/ViewBooklet';
import AdminSettings from './pages/AdminSettings';
import QuestionPaperConfig from './pages/QuestionPaperConfig';
import AnswerSheetDesigner from './pages/AnswerSheetDesigner';
import TimeReport from './pages/TimeReport';
import ScanQcPortal from './pages/ScanQcPortal';
import ScanTemplateForm from './pages/ScanTemplateForm';

function ProtectedRoute({ children, requiredRole, allowedRoles }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  const roles = allowedRoles || (requiredRole ? [requiredRole, 'Admin'] : null);
  if (roles) {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const roleName = user.roleName ?? user.roloName;
      if (!roleName || !roles.includes(roleName)) {
        return <Navigate to="/" replace />;
      }
    } catch {
      return <Navigate to="/login" replace />;
    }
  }
  return children;
}

/** Scan DB users: operator / vendor QC / customer QC / scan Admin */
function ProtectedScanRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const role = user.roleName ?? user.roloName;
    const okSource = user.source === 'scan';
    const okRole = ['VendorQC', 'CustomerQC', 'Operator', 'Admin'].includes(role);
    if (!okSource || !okRole) return <Navigate to="/login" replace />;
  } catch {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/verify-otp" element={<VerifyOtp />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/change-password" element={<ChangePassword />} />

        <Route
          path="/scan-qc"
          element={
            <ProtectedScanRoute>
              <ScanQcPortal />
            </ProtectedScanRoute>
          }
        />

        {/* Head-evaluator portal — separate login entry */}
        <Route path="/head-eval/login" element={<HeadEvalLogin />} />

        {/* Protected app routes with shared Layout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="evaluate/:bookletId" element={<Evaluate />} />
          <Route path="view-booklet/:bookletId" element={<ViewBooklet />} />
          <Route path="profile" element={<Profile />} />
          <Route
            path="head-eval/assign"
            element={
              <ProtectedRoute requiredRole="HeadEvaluator">
                <HeadEvalAssign />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/settings"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'ScanAdmin']}>
                <AdminSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/settings/scanner/templates/new"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'ScanAdmin']}>
                <ScanTemplateForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/settings/scanner/templates/:templateId"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'ScanAdmin']}>
                <ScanTemplateForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/scanned-booklets"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'ScanAdmin']}>
                <Navigate to="/admin/settings?tab=scanner&subtab=booklets" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/question-papers"
            element={
              <ProtectedRoute requiredRole="Admin">
                <QuestionPaperConfig />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/answer-sheets"
            element={
              <ProtectedRoute requiredRole="Admin">
                <AnswerSheetDesigner />
              </ProtectedRoute>
            }
          />
          <Route path="reports/time" element={<TimeReport />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
