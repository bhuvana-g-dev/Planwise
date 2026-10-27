import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import EventLayout from "./layouts/EventLayout";
import { PageFallback } from "./components/ui";

// Route-level code splitting: each page is its own chunk, loaded on navigation.
// The app shell (AppLayout/EventLayout) and auth stay eager so first paint and
// authentication are not delayed. Leaflet (via VenueDiscovery/VenueMap) and the
// heavier pages no longer ship in the initial bundle.
const Landing = lazy(() => import("./pages/Landing"));
const CreateEvent = lazy(() => import("./pages/CreateEvent"));
const EventsList = lazy(() => import("./pages/EventsList"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const BudgetPlanner = lazy(() => import("./pages/BudgetPlanner"));
const Timeline = lazy(() => import("./pages/Timeline"));
const AdaptPlan = lazy(() => import("./pages/AdaptPlan"));
const Vendors = lazy(() => import("./pages/Vendors"));
const Guests = lazy(() => import("./pages/Guests"));
const Catering = lazy(() => import("./pages/Catering"));
const VenueDiscovery = lazy(() => import("./pages/VenueDiscovery"));
const EventDay = lazy(() => import("./pages/EventDay"));

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
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
            <Route path="catering" element={<Catering />} />
            <Route path="venues-discovery" element={<VenueDiscovery />} />
            <Route path="event-day" element={<EventDay />} />
          </Route>
          <Route path="*" element={<Landing />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
