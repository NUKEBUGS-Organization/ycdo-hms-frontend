import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { TokenPrintHost } from './components/TokenPrintHost';
import { ShellLayout } from './layouts/ShellLayout';
import { DispensePage } from './pages/DispensePage';
import { PatientsPage } from './pages/PatientsPage';
import { RegistrationPage } from './pages/RegistrationPage';
import { StockPage } from './pages/StockPage';
import { AppProviders } from './providers';

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Routes>
          <Route element={<ShellLayout />}>
            <Route index element={<Navigate to="/registration" replace />} />
            <Route path="registration" element={<RegistrationPage />} />
            <Route path="dispense" element={<DispensePage />} />
            <Route
              path="reception"
              element={<Navigate to="/registration" replace />}
            />
            <Route path="patients" element={<PatientsPage />} />
            <Route path="stock" element={<StockPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/registration" replace />} />
        </Routes>
      </BrowserRouter>
      <TokenPrintHost />
    </AppProviders>
  );
}
