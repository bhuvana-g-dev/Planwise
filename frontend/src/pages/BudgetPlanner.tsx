import { Link, useParams } from "react-router-dom";
import { useEventDetail } from "../hooks/useEventDetail";
import { Badge, EmptyState, ErrorBanner, Spinner } from "../components/ui";
import BudgetSummaryCard from "../components/BudgetSummaryCard";
import { formatINR, titleCase } from "../utils/format";

export default function BudgetPlanner() {
  const { eventId } = useParams();
  const { data, loading, error } = useEventDetail(eventId);

  if (loading) return <Spinner label="Loading budget…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;
  const plan = data.active_plan;

  if (!plan)
    return (
      <EmptyState
        title="No plan to budget yet"
        description="Generate a plan from the dashboard first."
        action={
          <Link to={`/events/${eventId}`} className="btn-primary">
            Back to dashboard
          </Link>
        }
      />
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Budget planner</h1>
        <Link to={`/events/${eventId}/adapt`} className="btn-primary">
          Change budget
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <BudgetSummaryCard budget={plan.budget} />
        </div>

        <div className="card overflow-hidden lg:col-span-2">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.expenses.map((e) => (
                <tr key={e.id}>
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
            <tfoot className="bg-slate-50 font-semibold">
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
      </div>

      <p className="text-xs text-slate-400">
        All amounts are backend-computed estimates in INR, not verified vendor
        quotations.
      </p>
    </div>
  );
}
