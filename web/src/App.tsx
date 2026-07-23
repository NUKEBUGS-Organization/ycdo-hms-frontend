import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { TokenPrintHost } from './components/TokenPrintHost';
import { ShellLayout } from './layouts/ShellLayout';
import { PatientsPage } from './pages/PatientsPage';
import { ReceptionPage } from './pages/ReceptionPage';
import { StockPage } from './pages/StockPage';
import { AppProviders } from './providers';

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Routes>
          <Route element={<ShellLayout />}>
            <Route index element={<Navigate to="/reception" replace />} />
            <Route path="reception" element={<ReceptionPage />} />
            <Route path="patients" element={<PatientsPage />} />
            <Route path="stock" element={<StockPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/reception" replace />} />
        </Routes>
      </BrowserRouter>
      <TokenPrintHost />
    </AppProviders>
  );
}
