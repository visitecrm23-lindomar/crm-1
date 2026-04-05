import { useGetDashboardSummary, useGetDashboardUpcomingTrips } from "@workspace/api-client-react";
import { Users, Map, DollarSign, CalendarCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: trips, isLoading: loadingTrips } = useGetDashboardUpcomingTrips();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Welcome back to your command center.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">{summary?.totalClients}</div>
                <p className="text-xs text-muted-foreground">+{summary?.newClientsThisMonth} this month</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Trips</CardTitle>
            <Map className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">{summary?.activeTrips}</div>
                <p className="text-xs text-muted-foreground">Out of {summary?.totalTrips} total</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">R$ {summary?.totalRevenue?.toLocaleString('pt-BR')}</div>
                <p className="text-xs text-muted-foreground">R$ {summary?.revenueThisMonth?.toLocaleString('pt-BR')} this month</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reservations</CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">{summary?.confirmedReservations}</div>
                <p className="text-xs text-muted-foreground">{summary?.occupancyRate}% occupancy rate</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Upcoming Trips</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingTrips ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : trips?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No upcoming trips</div>
            ) : (
              <div className="space-y-4">
                {trips?.map((trip) => (
                  <div key={trip.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">{trip.name}</p>
                      <p className="text-sm text-muted-foreground">{new Date(trip.departureDate).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{trip.availableSeats} seats left</p>
                      <p className="text-sm text-muted-foreground">of {trip.totalCapacity} total</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
