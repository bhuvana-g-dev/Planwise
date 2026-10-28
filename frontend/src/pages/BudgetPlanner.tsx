import { Link, useParams } from "react-router-dom";
import { PieChart, RefreshCw } from "lucide-react";
import { useEventDetail } from "../hooks/useEventDetail";
import { Badge, EmptyState, ErrorBanner, Skeleton } from "../components/ui";
import ModuleHeader from "../components/ModuleHeader";
import { BudgetArt } from "../components/Illustrations";
import { eventTheme } from "../theme/eventTheme";
import BudgetSummaryCard from "../components/BudgetSummaryCard";
import BudgetChart from "../components/BudgetChart";
import { formatINR, titleCase } from "../utils/format";

export default function BudgetPlanner() {
  const { eventId } = useParams();
  const { data, loading, error } = useEventDetail(eventId);

  if (loading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full lg:col-span-2" />
        </div>
      </div>
    );
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;
  const plan = data.active_plan;
  const theme = eventTheme(data.event.event_type, data.event.style);

  if (!plan)
    return (
      <EmptyState
        icon={<BudgetArt className="h-9 w-9" />}
        title="No plan to budget yet"
        description="Generate a plan from the dashboard first — it sets your category budgets automatically."
        action={
          <Link to={`/events/${eventId}`} className="btn-primary">
            Back to dashboard
          </Link>
        }
      />
    );

  return (
    <div className="stagger space-y-6">
      <div style={{ ["--i" as string]: 0 }}>
        <ModuleHeader
          theme={theme}
          eyebrow="Budget planner"
          title="Budget planner"
          subtitle={`${data.event.name} · ${formatINR(
            plan.budget.budget_paise
          )} total budget`}
          art={<BudgetArt className="h-16 w-16" />}
          actions={
            <Link to={`/events/${eventId}/adapt`} className="btn-primary">
              <RefreshCw className="h-4 w-4" /> Change budget
            </Link>
          }
        />
      </div>

      <div
        className="grid gap-6 lg:grid-cols-3"
        style={{ ["--i" as string]: 1 }}
      >
        <div className="lg:col-span-1">
          <BudgetSummaryCard budget={plan.budget} />
        </div>
        <div className="card p-6 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <PieChart className="h-5 w-5 text-brand-600" />
            <h3 className="font-semibold text-slate-900">Category breakdown</h3>
          </div>
          <BudgetChart budget={plan.budget} />
        </div>
      </div>

      <div
        className="card overflow-hidden"
        style={{ ["--i" as string]: 2 }}
      >
        <table className="w-full text-sm">
          <thead className="bg-sand-100 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Item</th>
              <th className="px-5 py-3">Category</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {plan.expenses.map((e) => (
              <tr key={e.id} className="transition hover:bg-sand-50">
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-800">{e.label}</p>
                  {e.assumptions && (
                    <p className="text-xs text-slate-400">{e.assumptions}</p>
                  )}
                </td>
                <td className="px-5 py-3 text-slate-600">
                  {titleCase(e.category)}
                </td>
                <td className="px-5 py-3">
                  {e.negotiable ? (
                    <Badge tone="slate">Flexible</Badge>
                  ) : (
                    <Badge tone="amber">Locked</Badge>
                  )}
                  {e.source === "estimate" && (
                    <span className="ml-1 text-xs text-slate-400">est.</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right font-medium text-slate-900">
                  {formatINR(e.amount_paise)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-sand-100 font-semibold">
            <tr>
              <td className="px-5 py-3" colSpan={3}>
                Total allocated
              </td>
              <td className="px-5 py-3 text-right">
                {formatINR(plan.budget.allocated_paise)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        All amounts are backend-computed estimates in INR, not verified vendor
        quotations.
      </p>
    </div>
  );
}
