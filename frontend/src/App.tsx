import { Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import EventLayout from "./layouts/EventLayout";
import Landing from "./pages/Landing";
import CreateEvent from "./pages/CreateEvent";
import EventsList from "./pages/EventsList";
import Dashboard from "./pages/Dashboard";
import BudgetPlanner from "./pages/BudgetPlanner";
import Timeline from "./pages/Timeline";
import AdaptPlan from "./pages/AdaptPlan";
import Vendors from "./pages/Vendors";
import Guests from "./pages/Guests";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Landing />} />
        <Route path="create" element={<CreateEvent />} />
        <Route path="events" element={<EventsList />} />
        <Route path="events/:eventId" element={<EventLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="budget" element={<BudgetPlanner />} />
          <Route path="timeline" element={<Timeline />} />
          <Route path="adapt" element={<AdaptPlan />} />
          <Route path="vendors" element={<Vendors />} />
          <Route path="guests" element={<Guests />} />
        </Route>
        <Route path="*" element={<Landing />} />
      </Route>
    </Routes>
  );
}
