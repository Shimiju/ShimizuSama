import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import DashboardLayout from './layouts/DashboardLayout';
import ServerSelect from './pages/ServerSelect';
import ServerLayout from './layouts/ServerLayout';
import Overview from './pages/modules/Overview';
import Tickets from './pages/modules/Tickets';
import TicketViewer from './pages/TicketViewer';
import Economy from './pages/modules/Economy';
import Shop from './pages/modules/Shop';
import Moderation from './pages/modules/Moderation';
import CustomCommands from './pages/modules/CustomCommands';
import Welcome from './pages/modules/Welcome';
import ButtonRoles from './pages/modules/ButtonRoles';
import SocialFeeds from './pages/modules/SocialFeeds';
import AuditLogs from './pages/modules/AuditLogs';
import Casino from './pages/modules/Casino';

function App() {
  return (
    <>
      {/* Background animated blobs */}
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>

      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<ServerSelect />} />
            <Route path=":guildId" element={<ServerLayout />}>
              <Route index element={<Overview />} />
              <Route path="tickets" element={<Tickets />} />
              <Route path="tickets/:ticketId" element={<TicketViewer />} />
              <Route path="economy" element={<Economy />} />
              <Route path="shop" element={<Shop />} />
              <Route path="moderation" element={<Moderation />} />
              <Route path="custom-commands" element={<CustomCommands />} />
              <Route path="welcome" element={<Welcome />} />
              <Route path="button-roles" element={<ButtonRoles />} />
              <Route path="social-feeds" element={<SocialFeeds />} />
              <Route path="audit-logs" element={<AuditLogs />} />
              <Route path="casino" element={<Casino />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </>
  );
}

export default App;
