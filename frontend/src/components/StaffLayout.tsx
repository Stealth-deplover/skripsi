import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { Brain, Menu } from 'lucide-react';
import AIAssistant from './AIAssistant';
import StaffSidebar from './StaffSidebar';
import SystemCommandCenter from './SystemCommandCenter';

export default function StaffLayout() {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-shell dashboard-theme">
      <header className="mobile-topbar">
        <button type="button" className="mobile-menu-button" onClick={() => setSidebarOpen(true)} aria-label="Buka menu staf kampus">
          <Menu size={19} />
        </button>
        <div className="mobile-brand">
          <span className="mobile-brand-mark">
            <Brain size={17} />
          </span>
          <span>QC Analytics</span>
        </div>
      </header>

      <StaffSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenAssistant={() => {
          setAssistantOpen(true);
          setSidebarOpen(false);
        }}
      />
      {sidebarOpen && <button type="button" className="mobile-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Tutup menu" />}

      <main className="app-main">
        <Outlet />
      </main>
      <SystemCommandCenter role="staff" onOpenAssistant={() => setAssistantOpen(true)} />
      <AIAssistant role="staff" open={assistantOpen} onOpenChange={setAssistantOpen} />
    </div>
  );
}
