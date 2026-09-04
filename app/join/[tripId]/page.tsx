"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type InviteTrip = {
  trip_id: string;
  destination: string;
  start_date: string;
  end_date: string;
  travellers: number;
  budget_per_person: number;
  travel_style: string;
  expires_at: string | null;
};

export default function JoinTripPage() {
  const params = useParams<{ tripId: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [trip, setTrip] = useState<InviteTrip | null>(null);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadInvite() {
      const token = params.tripId;

      if (!token) {
        if (mounted) {
          setError("Invalid invitation link.");
          setLoading(false);
        }
        return;
      }

      const { data, error: inviteError } =
        await supabase.rpc("get_trip_invite", {
          p_token: token,
        });

      if (!mounted) return;

      if (inviteError) {
        console.error("Invite lookup error:", inviteError);
        setError(
          "We couldn't load this invitation. It may be invalid or expired.",
        );
        setLoading(false);
        return;
      }

      const invite = Array.isArray(data)
        ? data[0]
        : data;

      if (!invite) {
        setError(
          "This invitation is invalid or has expired.",
        );
        setLoading(false);
        return;
      }

      setTrip(invite as InviteTrip);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUserName(
          user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            "Traveller",
        );
      }

      setLoading(false);
    }

    loadInvite();

    return () => {
      mounted = false;
    };
  }, [params.tripId, supabase]);

  async function handleJoin() {
    if (!trip) return;

    setError("");
    setJoining(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const next = encodeURIComponent(
        `/join/${params.tripId}`,
      );

      router.push(
        `/auth/login?next=${next}`,
      );

      return;
    }

    const name =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Traveller";

    const { error: memberError } = await supabase
      .from("trip_members")
      .upsert(
        {
          trip_id: trip.trip_id,
          user_id: user.id,
          name,
          role: "traveller",
          invitation_status: "accepted",
        },
        {
          onConflict: "trip_id,user_id",
        },
      );

    if (memberError) {
      console.error(
        "Join member error:",
        memberError,
      );

      setError(memberError.message);
      setJoining(false);
      return;
    }

    const { error: preferenceError } =
      await supabase
        .from("preferences")
        .upsert(
          {
            trip_id: trip.trip_id,
            user_id: user.id,
            submitted: false,
            priorities: [],
          },
          {
            onConflict: "trip_id,user_id",
          },
        );

    if (preferenceError) {
      console.error(
        "Preference creation error:",
        preferenceError,
      );
    }

    await supabase
      .from("agent_actions")
      .insert({
        trip_id: trip.trip_id,
        agent_name:
          "Voyager Orchestrator",
        action_type:
          "traveller_joined",
        status: "completed",
        message:
          `${name} joined ${trip.destination}.`,
        metadata: {
          user_id: user.id,
          invitation_token:
            params.tripId,
        },
      });

    router.push("/");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f6f2]">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-lg font-bold text-white">
            V
          </div>

          <p className="mt-5 text-sm font-semibold">
            Opening your invitation…
          </p>

          <p className="mt-1 text-xs text-black/40">
            Voyager is checking the trip
          </p>
        </div>
      </main>
    );
  }

  if (!trip) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f6f2] px-5">
        <div className="w-full max-w-md rounded-[30px] border border-black/10 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-lg font-bold text-white">
            V
          </div>

          <h1 className="mt-6 text-2xl font-semibold">
            Invitation unavailable
          </h1>

          <p className="mt-2 text-sm leading-6 text-black/50">
            {error ||
              "This invitation is invalid or expired."}
          </p>

          <button
            onClick={() => router.push("/")}
            className="mt-7 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white"
          >
            Go to Voyager
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f6f2] px-5 py-10 text-[#171717]">
      <div className="w-full max-w-xl rounded-[34px] border border-black/10 bg-white p-7 shadow-[0_24px_90px_rgba(0,0,0,0.08)] md:p-9">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-lg font-bold text-white">
          V
        </div>

        <div className="mt-8 inline-flex rounded-full bg-[#e4f3e8] px-3 py-1.5 text-xs font-semibold text-[#2d7042]">
          You&apos;re invited
        </div>

        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em]">
          Join the {trip.destination} trip.
        </h1>

        <p className="mt-4 text-sm leading-7 text-black/50">
          Your group is planning together with Voyager.
          Join the Trip Room, share what matters to you,
          and help the agent find a plan everyone can agree on.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <InfoCard
            label="Dates"
            value={`${formatDate(
              trip.start_date,
            )} → ${formatDate(trip.end_date)}`}
          />

          <InfoCard
            label="Travellers"
            value={`${trip.travellers} people`}
          />

          <InfoCard
            label="Budget"
            value={`₹${Number(
              trip.budget_per_person,
            ).toLocaleString("en-IN")} / person`}
          />

          <InfoCard
            label="Style"
            value={trip.travel_style}
          />
        </div>

        {userName && (
          <div className="mt-5 rounded-2xl bg-[#f7f6f2] p-4">
            <p className="text-xs text-black/40">
              Joining as
            </p>

            <p className="mt-1 text-sm font-semibold">
              {userName}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-2xl bg-[#fff3f1] p-4 text-sm leading-6 text-[#a43827]">
            {error}
          </div>
        )}

        <button
          onClick={handleJoin}
          disabled={joining}
          className="mt-7 w-full rounded-full bg-black py-4 text-sm font-semibold text-white transition hover:scale-[1.005] disabled:opacity-50"
        >
          {joining
            ? "Joining your trip…"
            : "Join this trip →"}
        </button>

        <p className="mt-4 text-center text-xs leading-5 text-black/35">
          After joining, you&apos;ll choose your own budget,
          accommodation and priorities.
        </p>
      </div>
    </main>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#faf9f6] p-4">
      <p className="text-xs text-black/40">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold">
        {value}
      </p>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "—";

  const date = new Date(
    `${value}T00:00:00`,
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "numeric",
      month: "short",
    },
  );
}