import { Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import Landing from "./pages/Landing";
import CreateEvent from "./pages/CreateEvent";
import EventsList from "./pages/EventsList";
import Dashboard from "./pages/Dashboard";
import BudgetPlanner from "./pages/BudgetPlanner";
import Timeline from "./pages/Timeline";
import AdaptPlan from "./pages/AdaptPlan";
import Vendors from "./pages/Vendors";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Landing />} />
        <Route path="create" element={<CreateEvent />} />
        <Route path="events" element={<EventsList />} />
        <Route path="events/:eventId" element={<Dashboard />} />
        <Route path="events/:eventId/budget" element={<BudgetPlanner />} />
        <Route path="events/:eventId/timeline" element={<Timeline />} />
        <Route path="events/:eventId/adapt" element={<AdaptPlan />} />
        <Route path="events/:eventId/vendors" element={<Vendors />} />
        <Route path="*" element={<Landing />} />
      </Route>
    </Routes>
  );
}
