import { useRoute } from "wouter";
import { TripForm } from "./trips/TripForm";
import { TripList } from "./trips/TripList";
import { SeatMap } from "./trips/SeatMap";
import { PassengersOverview } from "./trips/PassengersOverview";
import { PassengersList } from "./trips/PassengersList";
import { TripCalendar } from "./trips/TripCalendar";

export { TripForm, TripList, SeatMap, PassengersOverview, PassengersList, TripCalendar };

export default function Trips() {
  const [matchNew] = useRoute("/trips/new");
  const [matchCalendar] = useRoute("/trips/calendar");
  const [matchEdit, paramsEdit] = useRoute("/trips/:id/edit");
  const [matchSeatMap, paramsSeatMap] = useRoute("/trips/:id/seat-map");
  const [matchPassengersOverview, paramsPassengersOverview] = useRoute("/trips/:id/passengers-overview");
  const [matchPassengers, paramsPassengers] = useRoute("/trips/:id/passengers");
  const [matchDetail, paramsDetail] = useRoute("/trips/:id");

  if (matchNew) return <TripForm />;
  if (matchCalendar) return <TripCalendar />;
  if (matchEdit && paramsEdit?.id) return <TripForm tripId={paramsEdit.id} />;
  if (matchSeatMap && paramsSeatMap?.id) return <SeatMap tripId={paramsSeatMap.id} />;
  if (matchPassengersOverview && paramsPassengersOverview?.id) return <PassengersOverview tripId={paramsPassengersOverview.id} />;
  if (matchPassengers && paramsPassengers?.id) return <PassengersList tripId={paramsPassengers.id} />;
  if (matchDetail && paramsDetail?.id) return <PassengersOverview tripId={paramsDetail.id} />;

  return <TripList />;
}
