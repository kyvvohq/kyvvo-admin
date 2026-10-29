import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layout/AdminLayout.jsx';
import AdministradoresPage from './pages/AdministradoresPage.jsx';

export default function App() {
  return (
    <BrowserRouter basename="/app">
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/administradores" element={<AdministradoresPage />} />
          <Route path="*" element={<Navigate to="/administradores" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
