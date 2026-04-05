import { useState } from "react";
import { Link } from "wouter";
import { useListTrips, useCreateTrip } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, MapPin, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Trips() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: tripsData, isLoading, refetch } = useListTrips({ search, page, limit: 10 });
  const createTrip = useCreateTrip();

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    await createTrip.mutateAsync({
      data: {
        name: formData.get("name") as string,
        destination: formData.get("destination") as string,
        destinationCity: formData.get("destinationCity") as string,
        destinationState: formData.get("destinationState") as string,
        type: formData.get("type") as string || "excursion",
        category: formData.get("category") as string || "standard",
        departureDate: formData.get("departureDate") as string,
        totalCapacity: parseInt(formData.get("totalCapacity") as string || "0"),
        priceAdult: parseFloat(formData.get("priceAdult") as string || "0"),
      }
    });
    setIsCreateOpen(false);
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trips</h1>
          <p className="text-muted-foreground mt-2">Manage your agency's excursions and packages.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> New Trip</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Trip</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4 mt-4">
              <div className="space-y-2 col-span-2">
                <label className="text-sm font-medium">Trip Name</label>
                <Input name="name" required placeholder="Summer in Rio" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Destination Title</label>
                <Input name="destination" required placeholder="Rio de Janeiro" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">City</label>
                <Input name="destinationCity" required placeholder="Rio de Janeiro" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">State (UF)</label>
                <Input name="destinationState" required placeholder="RJ" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Departure Date</label>
                <Input name="departureDate" type="date" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Capacity (Seats)</label>
                <Input name="totalCapacity" type="number" required placeholder="46" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Adult Price (R$)</label>
                <Input name="priceAdult" type="number" step="0.01" required placeholder="1500.00" />
              </div>
              <div className="col-span-2 pt-4 flex justify-end">
                <Button type="submit" disabled={createTrip.isPending}>
                  {createTrip.isPending ? "Creating..." : "Create Trip"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search trips..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trip</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Availability</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-10 w-[200px]" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-[150px]" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-[120px]" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-[80px] ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : tripsData?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No trips found.
                </TableCell>
              </TableRow>
            ) : (
              tripsData?.data.map((trip) => (
                <TableRow key={trip.id}>
                  <TableCell>
                    <p className="font-medium">{trip.name}</p>
                    <p className="text-xs text-muted-foreground">{trip.type} - {trip.category}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{trip.destinationCity}, {trip.destinationState}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{new Date(trip.departureDate).toLocaleDateString()}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm">{trip.availableSeats} of {trip.totalCapacity} left</span>
                      <div className="w-24 h-2 bg-secondary/20 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary" 
                          style={{ width: `${(trip.reservedSeats + trip.confirmedSeats) / trip.totalCapacity * 100}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      trip.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {trip.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/trips/${trip.id}`}>
                      <Button variant="ghost" size="sm">Manage</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
