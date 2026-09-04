/* Voyager — polished multi-city group travel workspace */
"use client";

import * as React from "react";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "motion/react";
import { useSpring, animated } from "@react-spring/web";
import { gsap } from "gsap";
import * as THREE from "three";
import anime from "animejs";

type Screen =
  | "dashboard" | "room" | "plans" | "verification" | "consent"
  | "payment" | "execution" | "monitoring" | "recovery" | "profile" | "permissions" | "create";

type TravelStyle = "Relaxed" | "Balanced" | "Adventure" | "Luxury";
type BudgetChoice = "₹20K" | "₹30K" | "₹40K+";
type StayChoice = "Budget" | "Balanced" | "Premium";
type PermissionKey = "research" | "reminders" | "replanning" | "spending" | "cancellation";
type PermissionMap = Record<PermissionKey, boolean>;

type Trip = {
  id: string; destination: string; start_date: string; end_date: string;
  travellers: number; budget_per_person: number; travel_style: TravelStyle;
  status: string; owner_id: string;
};

type Member = {
  id: string; trip_id: string; user_id: string | null; name: string;
  role: "owner" | "traveller"; invitation_status: "pending" | "accepted";
};

type Preference = {
  id: string; trip_id: string; user_id: string; budget_choice: BudgetChoice | null;
  stay_choice: StayChoice | null; priorities: string[]; submitted: boolean;
};

type Plan = {
  key: string; name: string; description: string; price: number; hotel: string;
  hotelRating: number; transport: string; activities: string[]; score: number;
  tradeoff: string; recommended: boolean; route: string[];
  verification: { price: number; cancellation: number; consistency: number; trust: number };
};

type ConsentMember = {
  id: string; consent_id: string; trip_id: string; user_id: string; required: boolean;
  status: "pending" | "approved" | "declined" | "expired";
  approved_amount: number | null; responded_at: string | null; created_at?: string;
};

const PRIORITIES = [
  "Beach","Food","Nightlife","Adventure","Culture","Relaxation",
  "Shopping","Photography","History","Nature","Wellness","Budget",
];

const FALLBACK_CITIES = [
  "Delhi","Jaipur","Udaipur","Ahmedabad","Mumbai","Goa","Bengaluru",
  "Hyderabad","Chennai","Kolkata","Amritsar","Varanasi","Agra","Jaisalmer",
  "Rishikesh","Pune","Kochi","Mysuru","Manali","Srinagar",
];

function money(v: number) { return `₹${Math.round(v).toLocaleString("en-IN")}`; }
function dateLabel(v?: string) {
  if (!v) return "—";
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-IN",{day:"numeric",month:"short"});
}
function splitRoute(v: string) { return v.split("→").map(x => x.trim()).filter(Boolean); }

function createPlan(trip: Trip, route: string[], multiplier: number, index: number): Plan {
  const presets = [
    {
      name:"Smart Saver",
      description:"Lower cost, fewer hand-offs and the group's strongest shared priorities.",
      hotel:"Verified smart stays",
      hotelRating:4.2,
      transport:"Rail + value intercity transport",
      activities:["Local food crawl","Heritage highlights","Market time","Flexible evenings"],
      score:88,
      tradeoff:"Longer transfer windows and simpler room categories."
    },
    {
      name:"Best Overall",
      description:"The best balance of comfort, time, trust and total trip cost.",
      hotel:"Curated boutique stays",
      hotelRating:4.6,
      transport:"Fast rail + flexible intercity legs",
      activities:["Signature city walk","Food trail","Sunset experience","Free-choice block"],
      score:95,
      tradeoff:"Slightly above the lowest-cost option for materially better flexibility."
    },
    {
      name:"Premium Escape",
      description:"More comfort and schedule flexibility for groups that value time.",
      hotel:"Premium city properties",
      hotelRating:4.8,
      transport:"Flexible flights + private transfers",
      activities:["Private guide","Curated dining","Premium experience","Flexible transfers"],
      score:91,
      tradeoff:"Highest price and premium inventory."
    }
  ];
  const p = presets[index];
  return {
    key:`${trip.id}-${index}-${route.join("-")}`,
    ...p,
    price:Math.round((trip.budget_per_person || 30000) * multiplier),
    route:[...route],
    recommended:index===1,
    verification:{
      price:index===1?24:23,
      cancellation:index===1?24:index===2?25:22,
      consistency:index===1?24:22,
      trust:index===1?23:index===2?24:23
    }
  };
}

export default function Home() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [screen,setScreen] = useState<Screen>("dashboard");
  const [userId,setUserId] = useState<string|null>(null);
  const [userName,setUserName] = useState("Traveller");
  const [userEmail,setUserEmail] = useState("");
  const [avatarUrl,setAvatarUrl] = useState("");
  const [authLoading,setAuthLoading] = useState(true);
  const [trips,setTrips] = useState<Trip[]>([]);
  const [currentTrip,setCurrentTrip] = useState<Trip|null>(null);
  const [members,setMembers] = useState<Member[]>([]);
  const [preferences,setPreferences] = useState<Preference[]>([]);
  const [selectedPlan,setSelectedPlan] = useState<Plan|null>(null);
  const [bookingConsentId,setBookingConsentId] = useState<string|null>(null);
  const [consentMembers,setConsentMembers] = useState<ConsentMember[]>([]);
  const [consentDeadline,setConsentDeadline] = useState<string|null>(null);
  const [showCreate,setShowCreate] = useState(false);
  const [showPreferences,setShowPreferences] = useState(false);
  const [showInvite,setShowInvite] = useState(false);
  const [menuOpen,setMenuOpen] = useState(false);
  const [inviteGenerated,setInviteGenerated] = useState(false);
  const [working,setWorking] = useState(false);
  const [agentReply,setAgentReply] = useState("");
  const [agentBusy,setAgentBusy] = useState(false);
  const [toast,setToast] = useState("");
  const [profileSaving,setProfileSaving] = useState(false);
  const [profileDraft,setProfileDraft] = useState("");
  const [permissions,setPermissions] = useState({research:true,reminders:true,replanning:true,spending:false,cancellation:false});
  const [tripForm,setTripForm] = useState({
    origin:"Delhi", stops:["Jaipur","Udaipur","Ahmedabad"],
    startDate:"2027-04-20", endDate:"2027-04-25", travellers:6,budget:30000,style:"Balanced" as TravelStyle
  });
  const [preferenceForm,setPreferenceForm] = useState({
    budget:"₹30K" as BudgetChoice,stay:"Balanced" as StayChoice,priorities:["Food","Culture","Photography"] as string[]
  });

  const submitted=preferences.filter(p=>p.submitted);
  const route=currentTrip?splitRoute(currentTrip.destination):[];
  const plans=useMemo(()=>currentTrip?[createPlan(currentTrip,route,0.78,0),createPlan(currentTrip,route,0.94,1),createPlan(currentTrip,route,1.16,2)]:[],[currentTrip,route.join("|")]);
  const required=consentMembers.filter(m=>m.required);
  const approved=required.filter(m=>m.status==="approved").length;
  const declined=required.filter(m=>m.status==="declined").length;
  const consentReady=required.length>0&&approved===required.length&&declined===0;
const heroRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!heroRef.current)return;
    const ctx=gsap.context(()=>{
      const nodes=heroRef.current?.querySelectorAll("[data-gsap]");
      if(!nodes?.length)return;
      gsap.fromTo(nodes,{y:28,opacity:0},{y:0,opacity:1,duration:.9,stagger:.08,ease:"power3.out"});
      const onScroll=()=>{
        const y=window.scrollY;
        gsap.to(heroRef.current,{y:y*.035,duration:.45,ease:"power2.out",overwrite:true});
      };
      window.addEventListener("scroll",onScroll,{passive:true});
      return ()=>window.removeEventListener("scroll",onScroll);
    },heroRef);
    return ()=>ctx.revert();
  },[]);

  const consensus=useMemo(()=>{
    const count=(values:string[])=>values.reduce<Record<string,number>>((a,v)=>{if(v)a[v]=(a[v]||0)+1;return a;},{});
    const top=(m:Record<string,number>)=>Object.entries(m).sort((a,b)=>b[1]-a[1])[0]||["—",0];
    const b=top(count(submitted.map(x=>x.budget_choice||"")));
    const s=top(count(submitted.map(x=>x.stay_choice||"")));
    const p=top(count(submitted.flatMap(x=>x.priorities)));
    const n=Math.max(submitted.length,1);
    return {budget:b[0],budgetScore:Math.round(Number(b[1])/n*100),stay:s[0],stayScore:Math.round(Number(s[1])/n*100),priority:p[0],priorityScore:Math.round(Number(p[1])/n*100)};
  },[submitted]);

  useEffect(()=>{
    const init=async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){router.replace("/auth/login");return;}
      const name=user.user_metadata?.full_name||user.user_metadata?.name||user.email?.split("@")[0]||"Traveller";
      setUserId(user.id);setUserName(name);setProfileDraft(name);setUserEmail(user.email||"");setAvatarUrl(user.user_metadata?.avatar_url||"");
      await supabase.from("profiles").upsert({id:user.id,full_name:name,avatar_url:user.user_metadata?.avatar_url??null},{onConflict:"id"});
      const {data}=await supabase.from("trips").select("*").eq("owner_id",user.id).order("created_at",{ascending:false});
      const real=(data??[]) as Trip[];setTrips(real);setCurrentTrip(real[0]??null);setAuthLoading(false);
    };
    void init();
  },[router,supabase]);

  useEffect(()=>{
    if(!currentTrip||currentTrip.id==="demo")return;
    const load=async()=>{
      const [m,p]=await Promise.all([
        supabase.from("trip_members").select("*").eq("trip_id",currentTrip.id),
        supabase.from("preferences").select("*").eq("trip_id",currentTrip.id)
      ]);
      if(!m.error)setMembers((m.data??[]) as Member[]);
      if(!p.error)setPreferences((p.data??[]) as Preference[]);
    };
    void load();
  },[currentTrip,supabase]);

  useEffect(()=>{
    if(!currentTrip||!bookingConsentId||screen!=="consent")return;
    const channel=supabase.channel(`voyager-consent-${currentTrip.id}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"booking_consent_members",filter:`consent_id=eq.${bookingConsentId}`},async()=>{
        const {data}=await supabase.from("booking_consent_members").select("*").eq("consent_id",bookingConsentId).order("created_at",{ascending:true});
        if(data)setConsentMembers(data as ConsentMember[]);
      }).subscribe();
    return ()=>{void supabase.removeChannel(channel)};
  },[bookingConsentId,currentTrip,screen,supabase]);

  function notify(msg:string){setToast(msg);window.setTimeout(()=>setToast(""),3000);}
  function navigate(next:Screen){setMenuOpen(false);setScreen(next);}
  function allCities(query:string){return FALLBACK_CITIES.filter(c=>c.toLowerCase().includes(query.toLowerCase())).slice(0,6);}

  function localAgentFallback(query:string){
    const q=query.toLowerCase().trim();
    const cities=FALLBACK_CITIES.filter((city)=>q.includes(city.toLowerCase()));
    const people=q.match(/(\d+)\s*(people|persons|friends|travellers|travelers|pax)/i);
    const budget=q.match(/(?:under|below|budget|₹|rs\.?)\s*([\d,]+)/i);

    if(cities.length>=2){
      const cleanRoute=cities.slice(0,8);
      setTripForm((prev)=>({
        ...prev,
        origin:cleanRoute[0],
        stops:cleanRoute.slice(1),
        travellers:people?Math.max(1,Number(people[1])):prev.travellers,
        budget:budget?Math.max(1000,Number(budget[1].replace(/,/g,""))):prev.budget
      }));
      setAgentReply(`I mapped ${cleanRoute.join(" → ")}. I can now turn this into a Voyager trip workspace.`);
      setScreen("create");
      return;
    }

    if(q.includes("profile")||q.includes("settings")){
      setAgentReply("Open Profile to manage your traveller details, defaults and agent permissions.");
      setScreen("profile");
      return;
    }

    if(q.includes("hotel")||q.includes("risk")||q.includes("verify")){
      setAgentReply("Voyager verifies price stability, cancellation flexibility, listing consistency and trust signals before financial consent.");
      if(selectedPlan)setScreen("verification");
      return;
    }

    if(q.includes("recover")||q.includes("cancel")||q.includes("disruption")){
      setAgentReply("Open the recovery workspace to review the affected travellers, replacement options and exact cost delta.");
      if(currentTrip)setScreen("recovery");
      return;
    }

    setAgentReply("I can plan a route, compare travel options, explain booking risk, manage your profile, or recover a disrupted trip. Try “Delhi to Jaipur to Udaipur for 5 friends under ₹30k each.”");
  }

  async function askAgent(query:string){
    const value=query.trim();
    if(!value||agentBusy)return;
    setAgentBusy(true);
    setAgentReply("Thinking through the route, group constraints and next best action…");
    try{
      const res=await fetch("/api/agent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:value,trip:currentTrip?{destination:currentTrip.destination,start_date:currentTrip.start_date,end_date:currentTrip.end_date,travellers:currentTrip.travellers,budget_per_person:currentTrip.budget_per_person,travel_style:currentTrip.travel_style}:null})});
      const body=await res.json().catch(()=>({}));
      if(!res.ok){
        console.warn("Voyager agent endpoint returned",res.status,body);
        localAgentFallback(value);
        return;
      }
      const message=String(body?.message||"I understood the request, but I need a little more detail.");
      setAgentReply(message);
      const extracted=Array.isArray(body?.route)?body.route.filter((x:any)=>typeof x==="string"&&x.trim()):[];
      const lower=value.toLowerCase();
      if(extracted.length>=2){
        setTripForm(prev=>({...prev,origin:extracted[0],stops:extracted.slice(1),travellers:Number(body?.travellers)||prev.travellers,budget:Number(body?.budget_per_person)||prev.budget,style:(body?.style&&["Relaxed","Balanced","Adventure","Luxury"].includes(body.style)?body.style:prev.style)}));
        setScreen("create");
        return;
      }
      if(body?.intent==="profile"||lower.includes("profile")){setScreen("profile");return;}
      if(body?.intent==="recover"||lower.includes("recover")||lower.includes("cancelled")){setScreen("recovery");return;}
      if(body?.intent==="verify"&&selectedPlan){setScreen("verification");return;}
    }catch(error){
      console.error(error);
      setAgentReply("I couldn’t reach the agent service. Your local planner is still available below.");
    }finally{setAgentBusy(false);}
  }

  async function createTrip(e?:FormEvent){
    e?.preventDefault();
    if(!userId){router.push("/auth/login");return;}
    const stops=[tripForm.origin,...tripForm.stops].map(x=>x.trim()).filter(Boolean);
    if(stops.length<2){notify("Add at least an origin and one stop.");return;}
    if(new Date(tripForm.endDate)<new Date(tripForm.startDate)){notify("End date must be after start date.");return;}
    setWorking(true);
    const destination=stops.join(" → ");
    const {data,error}=await supabase.from("trips").insert({
      owner_id:userId,destination,start_date:tripForm.startDate,end_date:tripForm.endDate,
      travellers:tripForm.travellers,budget_per_person:tripForm.budget,travel_style:tripForm.style,status:"planning"
    }).select("*").single();
    if(error||!data){notify(error?.message||"Could not create the trip.");setWorking(false);return;}
    const trip=data as Trip;
    await supabase.from("trip_members").insert({trip_id:trip.id,user_id:userId,name:userName,role:"owner",invitation_status:"accepted"});
    await supabase.from("preferences").insert({trip_id:trip.id,user_id:userId,submitted:false,priorities:[]});
    await supabase.from("agent_actions").insert({trip_id:trip.id,agent_name:"Voyager Orchestrator",action_type:"trip_created",status:"completed",message:`Trip created for ${destination}.`,metadata:{route:stops}});
    setTrips(x=>[trip,...x]);setCurrentTrip(trip);setMembers([{id:`owner-${trip.id}`,trip_id:trip.id,user_id:userId,name:userName,role:"owner",invitation_status:"accepted"}]);
    setPreferences([{id:`pref-${trip.id}`,trip_id:trip.id,user_id:userId,budget_choice:null,stay_choice:null,priorities:[],submitted:false}]);
    setShowCreate(false);setScreen("room");setWorking(false);notify("Trip created. Voyager is ready to coordinate it.");
  }

  async function savePreferences(){
    if(!currentTrip||!userId)return;
    const payload={trip_id:currentTrip.id,user_id:userId,budget_choice:preferenceForm.budget,stay_choice:preferenceForm.stay,priorities:preferenceForm.priorities,submitted:true};
    const {data,error}=await supabase.from("preferences").upsert(payload,{onConflict:"trip_id,user_id"}).select("*").single();
    if(error){notify(error.message);return;}
    setPreferences(x=>x.some(p=>p.user_id===userId)?x.map(p=>p.user_id===userId?data as Preference:p):[...x,data as Preference]);
    setShowPreferences(false);notify("Preferences saved. Voyager recalculated consensus.");
  }

  async function copyInviteLink(){
    if(!currentTrip||!userId){notify("Create a real trip first.");return;}
    setWorking(true);
    const {data:old}=await supabase.from("trip_invites").select("token").eq("trip_id",currentTrip.id).eq("created_by",userId).gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(1).maybeSingle();
    let token=old?.token;
    if(!token){
      const {data,error}=await supabase.from("trip_invites").insert({trip_id:currentTrip.id,created_by:userId}).select("token").single();
      if(error||!data){notify(error?.message||"Could not create invite.");setWorking(false);return;}
      token=data.token;
    }
    const url=`${window.location.origin}/join/${token}`;
    try{await navigator.clipboard.writeText(url);setInviteGenerated(true);notify("Secure invite copied.");}catch{window.prompt("Copy this secure invite link:",url);}
    setWorking(false);
  }

  async function startBookingConsent(plan:Plan){
    if(!currentTrip||!userId||currentTrip.id==="demo"){notify("Create a real trip before requesting booking consent.");return;}
    setWorking(true);
    const {data:existing,error:existingError}=await supabase.from("booking_consents").select("*").eq("trip_id",currentTrip.id).eq("plan_key",plan.key).in("status",["pending","approved"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(existingError){notify(existingError.message);setWorking(false);return;}
    let consent:any=existing;
    if(!consent){
      const accepted=members.filter(m=>m.invitation_status==="accepted"&&m.user_id);
      if(!accepted.length){notify("No joined travellers are available for consent yet.");setWorking(false);return;}
      const deadline=new Date(Date.now()+48*60*60*1000).toISOString();
      const {data,error}=await supabase.from("booking_consents").insert({
        trip_id:currentTrip.id,plan_id:null,plan_key:plan.key,plan_snapshot:plan,status:"pending",
        quoted_amount_per_person:plan.price,quoted_total_amount:plan.price*accepted.length,currency:"INR",
        price_tolerance_percent:5,payment_status:"not_started",consent_deadline:deadline,created_by:userId
      }).select("*").single();
      if(error||!data){notify(error?.message||"Could not start consent.");setWorking(false);return;}
      consent=data;
      const rows=accepted.map(m=>({consent_id:consent.id,trip_id:currentTrip.id,user_id:m.user_id!,required:true,status:"pending"}));
      const {error:memberError}=await supabase.from("booking_consent_members").insert(rows);
      if(memberError){notify(memberError.message);setWorking(false);return;}
    }
    const {data:rows,error:rowsError}=await supabase.from("booking_consent_members").select("*").eq("consent_id",consent.id).order("created_at",{ascending:true});
    if(rowsError){notify(rowsError.message);setWorking(false);return;}
    setBookingConsentId(consent.id);setConsentMembers((rows??[]) as ConsentMember[]);setConsentDeadline(consent.consent_deadline);setSelectedPlan(plan);setWorking(false);setScreen(consent.payment_status==="authorized"?"payment":"consent");
  }

  async function respondConsent(status:"approved"|"declined"){
    if(!bookingConsentId||!userId||!selectedPlan)return;
    const own=consentMembers.find(x=>x.user_id===userId);if(!own){notify("You are not on this consent.");return;}
    setWorking(true);
    const {data,error}=await supabase.from("booking_consent_members").update({status,approved_amount:status==="approved"?selectedPlan.price:null,responded_at:new Date().toISOString()}).eq("id",own.id).eq("user_id",userId).select("*").single();
    if(error||!data){notify(error?.message||"Could not record your decision.");setWorking(false);return;}
    setConsentMembers(x=>x.map(m=>m.id===data.id?data as ConsentMember:m));
    await supabase.from("agent_actions").insert({trip_id:currentTrip!.id,agent_name:"Voyager Consent Agent",action_type:status==="approved"?"booking_consent_approved":"booking_consent_declined",status:"completed",message:status==="approved"?`Traveller approved ${money(selectedPlan.price)}.`:"Traveller declined the booking.",metadata:{consent_id:bookingConsentId,user_id:userId}});
    setWorking(false);notify(status==="approved"?"Your approval is recorded.":"Booking blocked until the decline is resolved.");
  }

  async function continuePayment(){
    if(!consentReady||!bookingConsentId||!currentTrip){notify("Every financially affected traveller must approve first.");return;}
    const {error}=await supabase.from("booking_consents").update({status:"approved",payment_status:"authorization_pending"}).eq("id",bookingConsentId).eq("trip_id",currentTrip.id);
    if(error){notify(error.message);return;}
    setScreen("payment");notify("Consent complete. Payment authorization is next.");
  }

  async function authorizePayment(){
    if(!bookingConsentId||!currentTrip)return;
    setWorking(true);
    try{
      const res=await fetch("/api/payments/authorize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({consentId:bookingConsentId})});
      const body=await res.json().catch(()=>({}));
      if(!res.ok){notify(body.error||"Payment rail is not configured yet.");return;}
      if(body.status==="authorized"){await supabase.from("booking_consents").update({payment_status:"authorized"}).eq("id",bookingConsentId);setScreen("execution");notify("Payment authorized. Booking execution is next.");}
      else notify("Authorization is still pending.");
    }catch{notify("Payment authorization service is unavailable.");}finally{setWorking(false);}
  }

  async function saveProfile(){
    if(!userId)return;setProfileSaving(true);
    const {error}=await supabase.from("profiles").upsert({id:userId,full_name:profileDraft.trim()||userName},{onConflict:"id"});
    if(error){notify(error.message)}else{setUserName(profileDraft.trim()||"Traveller");notify("Profile updated.");}
    setProfileSaving(false);
  }

  if(authLoading)return <LoadingScreen/>;

  return (
    <main ref={heroRef} className="min-h-screen bg-[#f6f4ef] text-[#171717] overflow-x-hidden">
      <AmbientCanvas/>
      <Navbar screen={screen} userName={userName} menuOpen={menuOpen} onMenu={()=>setMenuOpen(v=>!v)}
        onNavigate={navigate} onLogout={async()=>{await supabase.auth.signOut();router.push("/auth/login");router.refresh();}} avatarUrl={avatarUrl}/>
      <AnimatePresence mode="wait">
        {screen==="dashboard"&&<motion.div key="dashboard" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}><Dashboard trip={currentTrip} trips={trips} userName={userName} agentReply={agentReply} agentBusy={agentBusy} onAsk={askAgent} onCreate={()=>setScreen("create")} onOpen={t=>{setCurrentTrip(t);setScreen("room")}} onHow={()=>notify("Collect → Decide → Verify → Authorize → Book → Monitor → Recover")} onProfile={()=>setScreen("profile")}/></motion.div>}
        {screen==="create"&&<motion.div key="create" initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-12}}><CreateTripModal trip={tripForm} working={working} onClose={()=>setScreen("dashboard")} onSubmit={createTrip} onChange={setTripForm} allCities={allCities}/></motion.div>}
        {screen==="room"&&currentTrip&&<motion.div key="room" initial={{opacity:0,x:18}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-18}}><TripRoom trip={currentTrip} members={members} preferences={preferences} consensus={consensus} onBack={()=>setScreen("dashboard")} onInvite={()=>{setInviteGenerated(false);setShowInvite(true)}} onPreferences={()=>setShowPreferences(true)} onBuild={()=>setScreen("plans")}/></motion.div>}
        {screen==="plans"&&currentTrip&&<motion.div key="plans" initial={{opacity:0,x:18}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-18}}><PlansScreen trip={currentTrip} plans={plans} consensus={consensus} onBack={()=>setScreen("room")} onChoose={p=>{setSelectedPlan(p);setScreen("verification")}}/></motion.div>}
        {screen==="verification"&&currentTrip&&selectedPlan&&<motion.div key="verification" initial={{opacity:0,x:18}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-18}}><VerificationScreen trip={currentTrip} plan={selectedPlan} loading={working} onBack={()=>setScreen("plans")} onApprove={()=>void startBookingConsent(selectedPlan)}/></motion.div>}
        {screen==="consent"&&currentTrip&&selectedPlan&&<motion.div key="consent" initial={{opacity:0,x:18}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-18}}><BookingConsentScreen trip={currentTrip} plan={selectedPlan} members={consentMembers} deadline={consentDeadline} loading={working} onBack={()=>setScreen("verification")} onApprove={()=>void respondConsent("approved")} onDecline={()=>void respondConsent("declined")} onContinue={continuePayment}/></motion.div>}
        {screen==="payment"&&currentTrip&&selectedPlan&&<motion.div key="payment" initial={{opacity:0,x:18}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-18}}><PaymentScreen trip={currentTrip} plan={selectedPlan} count={required.length} loading={working} onBack={()=>setScreen("consent")} onAuthorize={authorizePayment}/></motion.div>}
        {screen==="execution"&&currentTrip&&selectedPlan&&<motion.div key="execution" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}><ExecutionScreen trip={currentTrip} plan={selectedPlan} count={required.length} onMonitoring={()=>setScreen("monitoring")} onRecovery={()=>setScreen("recovery")} onBack={()=>setScreen("dashboard")}/></motion.div>}
        {screen==="monitoring"&&currentTrip&&selectedPlan&&<motion.div key="monitoring" initial={{opacity:0}} animate={{opacity:1}}><MonitoringScreen trip={currentTrip} plan={selectedPlan} onBack={()=>setScreen("execution")} onSimulate={()=>setScreen("recovery")}/></motion.div>}
        {screen==="recovery"&&currentTrip&&selectedPlan&&<motion.div key="recovery" initial={{opacity:0,y:18}} animate={{opacity:1,y:0}}><RecoveryScreen trip={currentTrip} plan={selectedPlan} onBack={()=>setScreen("monitoring")} onResolve={()=>{notify("Recovery decision recorded; provider rebooking remains a live connector action.");setScreen("execution")}}/></motion.div>}
        {screen==="profile"&&<motion.div key="profile" initial={{opacity:0,x:18}} animate={{opacity:1,x:0}}><ProfileScreen name={profileDraft} email={userEmail} avatarUrl={avatarUrl} saving={profileSaving} onBack={()=>setScreen("dashboard")} onName={setProfileDraft} onSave={saveProfile} onPermissions={()=>setScreen("permissions")}/></motion.div>}
        {screen==="permissions"&&<motion.div key="permissions" initial={{opacity:0,x:18}} animate={{opacity:1,x:0}}><PermissionsScreen values={permissions} onBack={()=>setScreen("profile")} onToggle={k=>setPermissions(p=>({...p,[k]:!p[k]}))}/></motion.div>}
      </AnimatePresence>

      {showCreate&&<CreateTripModal trip={tripForm} working={working} onClose={()=>setShowCreate(false)} onSubmit={createTrip} onChange={setTripForm} allCities={allCities}/>}
      {showPreferences&&<PreferenceModal value={preferenceForm} onClose={()=>setShowPreferences(false)} onChange={setPreferenceForm} onSubmit={savePreferences}/>}
      {showInvite&&currentTrip&&<InviteModal trip={currentTrip} generated={inviteGenerated} working={working} onClose={()=>setShowInvite(false)} onCopy={copyInviteLink}/>}
      {toast&&<motion.div initial={{opacity:0,y:15}} animate={{opacity:1,y:0}} exit={{opacity:0,y:10}} className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-[#161616] px-5 py-3 text-sm font-medium text-white shadow-2xl">{toast}</motion.div>}
    </main>
  );
}

function AmbientCanvas(){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!ref.current)return;
    const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(42,1,0.1,100);camera.position.z=4.7;
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));renderer.setSize(340,340);ref.current.appendChild(renderer.domElement);
    const globe=new THREE.Mesh(new THREE.SphereGeometry(1.15,28,28),new THREE.MeshBasicMaterial({color:0x938873,wireframe:true,transparent:true,opacity:.12}));
    scene.add(globe);const group=new THREE.Group();
    for(let i=0;i<24;i++){const a=new THREE.Mesh(new THREE.SphereGeometry(.018,8,8),new THREE.MeshBasicMaterial({color:0x161616}));const lat=(Math.random()-.5)*Math.PI;const lon=(Math.random()-.5)*Math.PI*2;const r=1.2;a.position.set(r*Math.cos(lat)*Math.cos(lon),r*Math.sin(lat),r*Math.cos(lat)*Math.sin(lon));group.add(a)}
    scene.add(group);
    let frame=0;const animate=()=>{globe.rotation.y+=.0018;group.rotation.y-=.0012;renderer.render(scene,camera);frame=requestAnimationFrame(animate)};animate();
    return()=>{cancelAnimationFrame(frame);renderer.dispose();scene.clear();renderer.domElement.remove()};
  },[]);
  return <div ref={ref} className="pointer-events-none fixed right-[-100px] top-28 z-0 hidden md:block opacity-80"/>;
}

function LoadingScreen(){return <div className="min-h-screen grid place-items-center bg-[#f6f4ef]"><motion.div initial={{scale:.9,opacity:0}} animate={{scale:1,opacity:1}} className="text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-[18px] bg-black text-white font-semibold">V</div><p className="mt-5 text-sm font-semibold">Loading Voyager…</p><p className="mt-1 text-xs text-black/40">Restoring your travel workspace</p></motion.div></div>}

function Navbar({screen,userName,menuOpen,onMenu,onNavigate,onLogout,avatarUrl}:{screen:Screen;userName:string;menuOpen:boolean;onMenu:()=>void;onNavigate:(x:Screen)=>void;onLogout:()=>Promise<void>;avatarUrl:string}){
  const active=["room","plans","verification","consent","payment","execution","monitoring","recovery"].includes(screen);
  return <nav className="sticky top-0 z-50 border-b border-black/10 bg-[#f6f4ef]/80 px-5 py-4 backdrop-blur-2xl md:px-10"><div className="mx-auto flex max-w-7xl items-center justify-between">
    <button onClick={()=>onNavigate("dashboard")} className="flex items-center gap-3 group"><div className="grid h-10 w-10 place-items-center rounded-[14px] bg-black text-white font-semibold group-hover:rotate-[-4deg] transition">V</div><div className="text-left"><p className="text-base font-semibold">Voyager</p><p className="text-[10px] uppercase tracking-[.16em] text-black/35">AI travel agent · always on</p></div></button>
    <div className="relative flex items-center gap-1"><div className="hidden md:flex">{<NavButton active={screen==="dashboard"} onClick={()=>onNavigate("dashboard")}>Trips</NavButton>}<NavButton active={active} onClick={()=>onNavigate("room")}>Activity</NavButton><NavButton active={screen==="profile"||screen==="permissions"} onClick={()=>onNavigate("profile")}>Profile</NavButton></div>
      <button onClick={onMenu} className="ml-2 grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-[#e4dfd5] text-xs font-semibold hover:bg-black hover:text-white transition">{avatarUrl?<img src={avatarUrl} alt="" className="h-full w-full object-cover"/>:userName.slice(0,1).toUpperCase()}</button>
      <AnimatePresence>{menuOpen&&<motion.div initial={{opacity:0,scale:.96,y:-5}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.96,y:-5}} className="absolute right-0 top-12 w-64 rounded-[22px] border border-black/10 bg-white p-2 shadow-2xl"><div className="px-3 py-3"><p className="text-xs text-black/40">Your profile</p><p className="mt-1 truncate text-sm font-semibold">{userName}</p></div><button onClick={()=>onNavigate("profile")} className="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-black/5">Profile & settings</button><button onClick={()=>onNavigate("permissions")} className="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-black/5">Agent controls</button><button onClick={onLogout} className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-[#a43827] hover:bg-[#fff3f1]">Sign out</button></motion.div>}</AnimatePresence>
    </div>
  </div></nav>
}
function NavButton({active,onClick,children}:{active:boolean;onClick:()=>void;children:ReactNode}){return <button onClick={onClick} className={`rounded-full px-4 py-2 text-sm transition ${active?"bg-black text-white":"text-black/50 hover:bg-black/5 hover:text-black"}`}>{children}</button>}

function Dashboard({trip,trips,userName,agentReply,agentBusy,onAsk,onCreate,onOpen,onHow,onProfile}:{trip:Trip|null;trips:Trip[];userName:string;agentReply:string;agentBusy:boolean;onAsk:(query:string)=>void;onCreate:()=>void;onOpen:(t:Trip)=>void;onHow:()=>void;onProfile:()=>void}){
  const sectionRef=useRef<HTMLElement>(null);
  const [query,setQuery]=useState("");
  const [activeAgent,setActiveAgent]=useState("Consensus");
  const route=trip?splitRoute(trip.destination):[];

  useEffect(()=>{
    if(!sectionRef.current)return;
    const cards=sectionRef.current.querySelectorAll(".dashboard-float");
    const ctx=gsap.context(()=>{
      gsap.fromTo(cards,{y:24,opacity:0},{y:0,opacity:1,stagger:.08,duration:.8,ease:"power3.out"});
      const onScroll=()=>{
        const y=window.scrollY;
        const orb=sectionRef.current?.querySelector(".dashboard-orb"); if(orb) gsap.to(orb,{y:y*.04,rotate:y*.01,duration:.4,ease:"power2.out",overwrite:true});
      };
      window.addEventListener("scroll",onScroll,{passive:true});
      return ()=>window.removeEventListener("scroll",onScroll);
    },sectionRef);
    return ()=>ctx.revert();
  },[]);

  const agentMessages:Record<string,string>={
    Consensus:"I compare everyone's preferences, surface conflicts and propose the smallest set of trade-offs the group can actually agree on.",
    Verification:"I cross-check price, cancellation, listing consistency and trust signals before a financial decision.",
    Execution:"Once the required travellers approve, I move the booking through payment authorization and provider execution states.",
    Recovery:"When the plan changes, I identify who is affected, calculate the exact impact and reopen consent only where money or commitments change."
  };

  return <section ref={sectionRef} className="relative overflow-hidden">
    <div className="pointer-events-none absolute inset-0">
      <div className="dashboard-orb absolute left-[8%] top-24 h-[22rem] w-[22rem] rounded-full bg-[#f1cfa1]/45 blur-3xl"/>
      <div className="absolute right-[3%] top-[14%] h-[27rem] w-[27rem] rounded-full bg-[#a8d8c2]/40 blur-3xl"/>
      <div className="absolute left-[42%] top-[48%] h-[20rem] w-[20rem] rounded-full bg-[#c6b5ef]/20 blur-3xl"/>
    </div>

    <div className="relative mx-auto max-w-[1500px] px-5 pb-24 pt-12 md:px-10 md:pt-16">
      <div className="dashboard-float grid items-end gap-10 lg:grid-cols-[1.2fr_.8fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/75 px-4 py-2 text-xs shadow-sm backdrop-blur-xl"><span className="h-2 w-2 animate-pulse rounded-full bg-[#42b879]"/>Voyager agent online</span>
            <span className="rounded-full bg-black px-3 py-2 text-[10px] font-bold tracking-[.16em] text-white">GROUPS</span>
            <span className="rounded-full bg-[#e3dbf5] px-3 py-2 text-[10px] font-bold tracking-[.16em] text-[#624b88]">AI NATIVE</span>
          </div>
          <h1 className="mt-8 max-w-5xl text-[4.7rem] font-semibold leading-[.82] tracking-[-.075em] sm:text-[6.2rem] md:text-[8.7rem]">
            Your trip
            <br/>
            <span className="text-black/55">has a brain.</span>
          </h1>
          <p className="mt-9 max-w-3xl text-base leading-7 text-black/55 md:text-xl md:leading-8">
            Voyager is an AI travel agent for groups: it turns scattered preferences into a route everyone can agree on, checks what you are about to buy, executes approved decisions and stays with the trip when reality changes.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <button onClick={onCreate} className="group rounded-full bg-black px-7 py-4 text-sm font-semibold text-white shadow-[0_15px_45px_rgba(0,0,0,.18)] transition hover:-translate-y-1 hover:shadow-[0_22px_65px_rgba(0,0,0,.22)]">Start planning <span className="ml-2 inline-block transition group-hover:translate-x-1">→</span></button>
            <button onClick={onHow} className="rounded-full border border-black/10 bg-white/75 px-7 py-4 text-sm font-semibold backdrop-blur transition hover:bg-white">See how the agent thinks</button>
            <button onClick={onProfile} className="rounded-full border border-black/10 bg-white/55 px-5 py-4 text-sm font-semibold text-black/55 transition hover:bg-white hover:text-black">Profile</button>
          </div>
        </div>

        <div className="dashboard-float rounded-[34px] border border-black/8 bg-[#131313] p-6 text-white shadow-[0_30px_100px_rgba(0,0,0,.2)] md:p-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[.2em] text-white/35">Live agent</p>
              <p className="mt-2 text-2xl font-semibold">Ask Voyager anything.</p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/[.07] text-sm">⌘</span>
          </div>
          <div className="mt-6 rounded-[22px] border border-white/10 bg-white/[.045] p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-black text-xs font-bold">V</div>
              <div>
                <p className="text-sm font-semibold">What are you trying to solve?</p>
                <p className="mt-1 text-xs leading-5 text-white/45">Try “Delhi to Jaipur to Udaipur for 5 friends under ₹30k each”.</p>
              </div>
            </div>
            <div className="mt-4 flex items-center rounded-[17px] border border-white/10 bg-black/20 p-2">
              <input disabled={agentBusy} value={query} onChange={e=>setQuery(e.target.value)} placeholder={agentBusy?"Voyager is thinking…":"Ask Voyager: plan, compare, verify, recover…"} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();if(query.trim())onAsk(query)}}} className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-white/25"/>
              <button onClick={()=>{if(query.trim())onAsk(query)}} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-black transition hover:scale-105">→</button>
            </div>
          </div>
          {agentReply && (
            <div className="mt-4 rounded-[18px] border border-white/10 bg-white/[.055] p-4">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${agentBusy?"animate-pulse bg-[#e9c46a]":"bg-[#64d39b]"}`}/>
                <p className="text-[10px] uppercase tracking-[.16em] text-white/35">
                  {agentBusy ? "Thinking" : "Voyager"}
                </p>
              </div>
              <p className="mt-2 text-sm leading-6 text-white/75">{agentReply}</p>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2">
            {["“Plan a weekend”","“Compare two routes”","“Check hotel risk”","“Recover this trip”"].map((item)=><button key={item} onClick={()=>{
  const text=item.replaceAll("“","").replaceAll("”","");
  setQuery(text);
  void onAsk(text);
}} className="rounded-[16px] border border-white/8 bg-white/[.035] px-3 py-2.5 text-left text-xs text-white/55 transition hover:bg-white/[.08] hover:text-white">{item}</button>)}
          </div>
        </div>
      </div>

      <div className="dashboard-float mt-12 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <LiveStat color="bg-[#e7d5f7]" number="01" label="Consensus" value="Agree faster"/>
        <LiveStat color="bg-[#dceee4]" number="02" label="Verification" value="Trust first"/>
        <LiveStat color="bg-[#f4e2c5]" number="03" label="Payment" value="Authorize safely"/>
        <LiveStat color="bg-[#d8e5f6]" number="04" label="Execution" value="Book with consent"/>
        <LiveStat color="bg-[#f2d5d1]" number="05" label="Recovery" value="Adapt instantly"/>
      </div>

      <div className="dashboard-float mt-6 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <div className="relative overflow-hidden rounded-[38px] border border-black/8 bg-white p-6 shadow-[0_25px_90px_rgba(0,0,0,.06)] md:p-8">
          <div className="absolute right-[-80px] top-[-80px] h-72 w-72 rounded-full bg-[#cfe6da]/55 blur-2xl"/>
          <div className="absolute bottom-[-110px] left-[25%] h-64 w-64 rounded-full bg-[#ead8ee]/45 blur-2xl"/>
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.19em] text-black/35">Current trip</p>
                <h2 className="mt-2 max-w-4xl text-3xl font-semibold tracking-[-.05em] md:text-5xl">{trip?.destination || "Your next trip starts here."}</h2>
              </div>
              <span className="rounded-full border border-black/8 bg-white/80 px-3 py-1.5 text-[10px] font-semibold">{trip ? `${trip.travellers} travellers` : "No trip yet"}</span>
            </div>

            {trip ? (
              <>
                <div className="mt-8 flex flex-wrap items-center gap-2">
                  {route.map((city,i)=><React.Fragment key={`${city}-${i}`}><motion.span layout whileHover={{y:-2}} className={`rounded-full px-4 py-2.5 text-xs font-semibold ${i===0?"bg-black text-white":"bg-[#f5f2ea] border border-black/7"}`}>{i+1} · {city}</motion.span>{i<route.length-1&&<span className="text-black/18">→</span>}</React.Fragment>)}
                </div>
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  <MiniStat label="Dates" value={`${dateLabel(trip.start_date)} → ${dateLabel(trip.end_date)}`}/>
                  <MiniStat label="Budget" value={`${money(trip.budget_per_person)} / person`}/>
                  <MiniStat label="Style" value={trip.travel_style}/>
                </div>
                <div className="mt-7 flex items-center justify-between gap-4 rounded-[24px] bg-[#f7f5ef] p-5">
                  <div><p className="text-[10px] uppercase tracking-[.16em] text-black/35">Next best action</p><p className="mt-1 text-sm font-semibold">Open your Trip Room and invite the group.</p></div>
                  <button onClick={()=>onOpen(trip)} className="rounded-full bg-black px-5 py-3 text-xs font-semibold text-white">Open trip →</button>
                </div>
              </>
            ):(
              <div className="mt-8 rounded-[26px] border border-dashed border-black/12 bg-[#faf9f6] p-8">
                <p className="text-xl font-semibold">Nothing in motion yet.</p>
                <p className="mt-2 max-w-xl text-sm leading-6 text-black/45">Create a route, invite your people and Voyager will start turning opinions into an executable plan.</p>
                <button onClick={onCreate} className="mt-6 rounded-full bg-black px-6 py-3.5 text-sm font-semibold text-white">Create your first trip →</button>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[38px] bg-[#171717] p-6 text-white shadow-[0_25px_90px_rgba(0,0,0,.14)] md:p-8">
          <div className="flex gap-2 overflow-x-auto pb-1 voyager-scrollbar">
            {Object.keys(agentMessages).map(name=><button key={name} onClick={()=>setActiveAgent(name)} className={`shrink-0 rounded-full px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[.12em] transition ${activeAgent===name?"bg-white text-black":"border border-white/10 text-white/45 hover:text-white"}`}>{name}</button>)}
          </div>
          <div className="mt-8">
            <p className="text-[10px] uppercase tracking-[.2em] text-white/30">Agent brain</p>
            <h3 className="mt-2 text-3xl font-semibold tracking-[-.04em]">{activeAgent} agent</h3>
            <p className="mt-4 text-sm leading-7 text-white/58">{agentBusy?"Thinking…":agentReply}</p>
          </div>
          <div className="mt-8 space-y-2">
            {["Understands the group","Explains the trade-off","Keeps money behind consent"].map((x,i)=><motion.div key={x} initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}} transition={{delay:i*.06}} className="flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/[.035] p-3.5"><span className="grid h-7 w-7 place-items-center rounded-full bg-white/[.08] text-[10px]">{i+1}</span><span className="text-xs text-white/62">{x}</span></motion.div>)}
          </div>
        </div>
      </div>

      <div className="dashboard-float mt-16">
        <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-black/35">How the product earns its place</p>
        <h2 className="mt-3 max-w-4xl text-4xl font-semibold tracking-[-.055em] md:text-6xl">A travel agent that keeps working after the itinerary is generated.</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-black/50">Modern travel planners increasingly bring chat, maps and editable itineraries into one workspace. Voyager adds the group layer: the decision, the verification, the authorization and the recovery loop.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <FeatureTile accent="bg-[#e8d4f3]" title="Visual planning" text="See the route as a sequence, not a wall of text, then edit it before the agent commits."/>
          <FeatureTile accent="bg-[#d7e9df]" title="Shared decision" text="Everyone adds preferences independently while Voyager explains where consensus exists and where it doesn't."/>
          <FeatureTile accent="bg-[#f1dfc4]" title="Action after planning" text="A plan is the start of execution: consent, payment, booking, monitoring and recovery."/>
        </div>
      </div>

      {trips.length>0&&<div className="dashboard-float mt-16"><div className="flex items-end justify-between gap-6"><div><p className="text-[10px] uppercase tracking-[.2em] text-black/35">Your trips</p><h2 className="mt-2 text-3xl font-semibold">Travel workspace</h2></div><span className="rounded-full bg-black px-3 py-1.5 text-[10px] font-semibold text-white">{trips.length} active</span></div><div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{trips.slice(0,9).map(t=><motion.button whileHover={{y:-5}} key={t.id} onClick={()=>onOpen(t)} className="rounded-[26px] border border-black/8 bg-white p-5 text-left shadow-sm"><div className="flex justify-between"><span className="text-[10px] uppercase tracking-[.16em] text-black/30">{t.status}</span><span className="text-xs text-black/30">{dateLabel(t.start_date)}</span></div><h3 className="mt-4 text-xl font-semibold">{t.destination}</h3><p className="mt-1 text-sm text-black/45">{t.travellers} travellers · {money(t.budget_per_person)}/person</p></motion.button>)}</div></div>}
    </div>
  </section>
}

function LiveStat({color,number,label,value}:{color:string;number:string;label:string;value:string}){
  return <motion.div whileHover={{y:-3}} className="rounded-[22px] border border-black/7 bg-white/70 p-4 backdrop-blur transition">
    <div className={`h-2 w-8 rounded-full ${color}`}/>
    <p className="mt-4 text-[9px] uppercase tracking-[.16em] text-black/35">{number} · {label}</p>
    <p className="mt-1 text-sm font-semibold">{value}</p>
  </motion.div>
}

function FeatureTile({accent,title,text}:{accent:string;title:string;text:string}){
  return <motion.div whileHover={{y:-5}} className="rounded-[28px] border border-black/8 bg-[#faf9f6] p-6 transition hover:bg-white">
    <div className={`h-2 w-10 rounded-full ${accent}`}/>
    <h3 className="mt-8 text-xl font-semibold">{title}</h3>
    <p className="mt-2 text-sm leading-6 text-black/50">{text}</p>
  </motion.div>
}

function TripRoom({trip,members,preferences,consensus,onBack,onInvite,onPreferences,onBuild}:{trip:Trip;members:Member[];preferences:Preference[];consensus:any;onBack:()=>void;onInvite:()=>void;onPreferences:()=>void;onBuild:()=>void}){
  const done=preferences.filter(p=>p.submitted).length;const expected=Math.max(trip.travellers,members.length);const progress=Math.min(100,Math.round(done/Math.max(expected,1)*100));
  const route=splitRoute(trip.destination);
  return <section className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-14"><button onClick={onBack} className="text-sm text-black/50 hover:text-black">← Dashboard</button><div className="mt-8 flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className="text-[11px] uppercase tracking-[.2em] text-black/35">Trip Room</p><h1 className="mt-2 max-w-5xl text-5xl font-semibold tracking-[-.055em]">{trip.destination}</h1><p className="mt-3 text-sm text-black/50">{dateLabel(trip.start_date)} → {dateLabel(trip.end_date)} · {trip.travellers} travellers · {money(trip.budget_per_person)}/person</p></div><button onClick={onInvite} className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white">Invite travellers +</button></div>
    <div className="mt-10 rounded-[30px] border border-black/10 bg-white p-5 shadow-sm"><p className="text-xs text-black/40">Route</p><div className="mt-4 flex gap-2 overflow-x-auto pb-2">{route.map((city,i)=><div key={city+i} className="flex shrink-0 items-center gap-2"><motion.div whileHover={{scale:1.03}} className="rounded-2xl border border-black/10 bg-[#faf9f6] px-4 py-3"><p className="text-[10px] uppercase tracking-[.15em] text-black/35">Stop {i+1}</p><p className="mt-1 font-semibold">{city}</p></motion.div>{i<route.length-1&&<span className="text-black/20">→</span>}</div>)}</div></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_.95fr]"><div className="rounded-[32px] border border-black/10 bg-white p-7"><div className="flex justify-between"><div><p className="text-xs text-black/40">Group preferences</p><h2 className="mt-1 text-2xl font-semibold">{done}/{expected} completed</h2></div><span className="rounded-full bg-[#e3f3e6] px-3 py-1.5 text-xs font-semibold text-[#2d7042]">{progress}%</span></div><div className="mt-5 h-2 rounded-full bg-black/5"><motion.div animate={{width:`${progress}%`}} className="h-full rounded-full bg-black"/></div><div className="mt-7 space-y-3">{members.map(m=>{const p=preferences.find(x=>x.user_id===m.user_id);const finished=!!p?.submitted;return <div key={m.id} className="flex justify-between rounded-2xl border border-black/8 bg-[#faf9f6] p-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-[#e4dfd5] text-sm font-semibold">{m.name.slice(0,1)}</div><div><p className="text-sm font-semibold">{m.name}{m.role==="owner"?" · organiser":""}</p><p className="mt-0.5 text-xs text-black/40">{finished?`${p?.budget_choice??"Set"} · ${p?.stay_choice??"Stay"}`:"Waiting for preferences"}</p></div></div><span className="rounded-full bg-white px-3 py-1.5 text-xs text-black/50">{finished?"✓ Done":"Pending"}</span></div>})}</div><button onClick={onPreferences} className="mt-6 w-full rounded-full border border-black/10 py-3.5 text-sm font-semibold">Open my preferences</button></div>
      <div className="rounded-[32px] bg-[#181818] p-7 text-white"><p className="text-[11px] uppercase tracking-[.18em] text-white/35">Consensus agent</p><h2 className="mt-2 text-3xl font-semibold">The group is converging.</h2><div className="mt-8 grid grid-cols-3 gap-3"><DarkMetric label="Budget" value={consensus.budget} sub={`${consensus.budgetScore}%`}/><DarkMetric label="Stay" value={consensus.stay} sub={`${consensus.stayScore}%`}/><DarkMetric label="Priority" value={consensus.priority} sub={`${consensus.priorityScore}%`}/></div><div className="mt-7 rounded-2xl bg-white/[.06] p-5"><p className="text-xs uppercase tracking-[.14em] text-white/35">Agent readout</p><p className="mt-2 text-sm leading-6 text-white/70">{consensus.priorityScore}% prioritise <strong>{String(consensus.priority).toLowerCase()}</strong>. Voyager will use the overlap to shape the route and trade-offs.</p></div><button onClick={onBuild} className="mt-7 w-full rounded-full bg-white py-4 text-sm font-semibold text-black">Build executable plans →</button></div></div>
  </section>
}

function PlansScreen({trip,plans,consensus,onBack,onChoose}:{trip:Trip;plans:Plan[];consensus:any;onBack:()=>void;onChoose:(p:Plan)=>void}){
  return <section className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-14"><button onClick={onBack} className="text-sm text-black/50">← Trip Room</button><p className="mt-8 text-[11px] uppercase tracking-[.2em] text-black/35">Agent recommendation</p><h1 className="mt-2 text-5xl font-semibold tracking-[-.055em]">One route. Three trade-offs.</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-black/55">Built around {String(consensus.priority).toLowerCase()}, {String(consensus.stay).toLowerCase()} stays and roughly {String(consensus.budget).toLowerCase()} per person.</p><div className="mt-10 grid gap-5 xl:grid-cols-3">{plans.map(p=><PlanCard key={p.key} plan={p} onChoose={()=>onChoose(p)}/>)}</div></section>
}
function PlanCard({plan,onChoose}:{plan:Plan;onChoose:()=>void}){const [hover,setHover]=useState(false);const press=useSpring({transform:hover?"scale(1.015)":"scale(1)",boxShadow:hover?"0 22px 70px rgba(0,0,0,.08)":"0 0 0 rgba(0,0,0,0)",config:{tension:300,friction:22}});return <animated.div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} style={press} className={`rounded-[30px] border p-6 transition ${plan.recommended?"border-black bg-white":"border-black/10 bg-white"}`}>{plan.recommended&&<span className="mb-5 inline-flex rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white">Voyager's pick</span>}<p className="text-xs uppercase tracking-[.16em] text-black/35">{plan.score}/100 group fit</p><h2 className="mt-2 text-2xl font-semibold">{plan.name}</h2><p className="mt-2 text-sm leading-6 text-black/50">{plan.description}</p><div className="mt-7 rounded-2xl bg-[#faf9f6] p-5"><p className="text-xs text-black/40">Estimated cost</p><p className="mt-1 text-3xl font-semibold">{money(plan.price)}</p><p className="text-xs text-black/40">per person</p></div><div className="my-6 h-px bg-black/[.07]"/><DetailRow label="Route" value={plan.route.join(" → ")}/><DetailRow label="Stay" value={plan.hotel}/><DetailRow label="Transport" value={plan.transport}/><div className="mt-5 flex flex-wrap gap-2">{plan.activities.map(a=><span key={a} className="rounded-full border border-black/10 px-3 py-1.5 text-xs">{a}</span>)}</div><div className="mt-6 rounded-2xl border border-black/10 p-4"><p className="text-xs text-black/40">Trade-off</p><p className="mt-1 text-xs leading-5 text-black/60">{plan.tradeoff}</p></div><button onClick={onChoose} className="mt-7 w-full rounded-full bg-black py-3.5 text-sm font-semibold text-white">Verify & continue →</button></animated.div>}

function VerificationScreen({trip,plan,onBack,onApprove,loading}:{trip:Trip;plan:Plan;onBack:()=>void;onApprove:()=>void;loading:boolean}){const total=Object.values(plan.verification).reduce((a,b)=>a+b,0);const checks=[["Price stability",plan.verification.price],["Cancellation flexibility",plan.verification.cancellation],["Listing consistency",plan.verification.consistency],["Trust / review signals",plan.verification.trust]] as const;return <section className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-14"><button onClick={onBack} className="text-sm text-black/50">← Trip options</button><div className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_.95fr]"><div className="rounded-[32px] border border-black/10 bg-white p-7"><p className="text-[11px] uppercase tracking-[.2em] text-black/35">Verification agent</p><h1 className="mt-2 text-4xl font-semibold">{plan.hotel}</h1><p className="mt-3 text-sm leading-7 text-black/50">Four equal, explainable risk dimensions. This score summarises current evidence; it is not a guarantee.</p><div className="mt-8 space-y-3">{checks.map(([title,score])=><VerificationRow key={title} title={title} score={score} detail={`Assessed as ${score}/25 against the current option snapshot.`}/>)}</div><div className="mt-7 rounded-[24px] bg-[#faf9f6] p-5"><div className="flex justify-between"><div><p className="text-xs text-black/40">Verification score</p><p className="mt-1 text-4xl font-semibold">{total}/100</p></div><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold">Explainable</span></div></div></div><div className="rounded-[32px] bg-[#181818] p-7 text-white"><p className="text-[11px] uppercase tracking-[.18em] text-white/35">Ready for consent</p><h2 className="mt-2 text-4xl font-semibold">{plan.name}</h2><div className="mt-7"><DarkSummary label="Route" value={plan.route.join(" → ")}/><DarkSummary label="Price" value={`${money(plan.price)} / person`}/><DarkSummary label="Group total" value={money(plan.price*trip.travellers)}/><DarkSummary label="Tolerance" value="±5% without fresh consent" /></div><div className="mt-7 rounded-2xl bg-white/[.06] p-5"><p className="text-xs uppercase tracking-[.14em] text-white/35">Boundary</p><p className="mt-2 text-sm leading-6 text-white/75">Verification does not charge anyone. The next step is traveller consent.</p></div><button disabled={loading} onClick={onApprove} className="mt-7 w-full rounded-full bg-white py-4 text-sm font-semibold text-black disabled:opacity-40">{loading?"Preparing…":"Request group consent →"}</button></div></div></section>}

function BookingConsentScreen({trip,plan,members,deadline,loading,onBack,onApprove,onDecline,onContinue}:{trip:Trip;plan:Plan;members:ConsentMember[];deadline:string|null;loading:boolean;onBack:()=>void;onApprove:()=>void;onDecline:()=>void;onContinue:()=>void}){
  const req=members.filter(m=>m.required);const a=req.filter(m=>m.status==="approved").length;const d=req.filter(m=>m.status==="declined").length;const ready=req.length>0&&a===req.length&&d===0;
  return <section className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-14"><button onClick={onBack} className="text-sm text-black/50">← Verification</button><div className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><div className="rounded-[32px] border border-black/10 bg-white p-7"><p className="text-[11px] uppercase tracking-[.2em] text-black/35">Booking consent</p><h1 className="mt-2 text-5xl font-semibold tracking-[-.055em]">Everyone approves before money moves.</h1><p className="mt-4 text-sm leading-7 text-black/55">Silence never becomes approval. A decline blocks the booking. New financial commitments are explicit.</p><div className="mt-8 grid gap-3 sm:grid-cols-3"><MiniStat label="Per person" value={money(plan.price)}/><MiniStat label="Group total" value={money(plan.price*req.length)}/><MiniStat label="Deadline" value={deadline?new Date(deadline).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}):"48 hours"}/></div><div className="mt-8 flex justify-between"><h2 className="text-2xl font-semibold">{a}/{req.length} approved</h2><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${d?"bg-[#fff0e8] text-[#a43827]":ready?"bg-[#e3f3e6] text-[#2d7042]":"bg-[#f2e8cf] text-[#795f26]"}`}>{d?"Booking blocked":ready?"Ready for authorization":"Waiting for group"}</span></div><div className="mt-4 h-2 rounded-full bg-black/5"><motion.div animate={{width:`${req.length?a/req.length*100:0}%`}} className="h-full rounded-full bg-black"/></div><div className="mt-6 space-y-3">{req.map((m,i)=><div key={m.id} className="flex justify-between rounded-2xl border border-black/8 bg-[#faf9f6] p-4"><div><p className="text-sm font-semibold">Traveller {i+1}</p><p className="text-xs text-black/40">{m.user_id===req[0]?.user_id?"You":"Financially affected"}</p></div><span className="rounded-full bg-white px-3 py-1.5 text-xs">{m.status}</span></div>)}</div></div><div className="rounded-[32px] bg-[#181818] p-7 text-white"><p className="text-[11px] uppercase tracking-[.18em] text-white/35">Your decision</p><h2 className="mt-2 text-3xl font-semibold">Approve {money(plan.price)}?</h2><div className="mt-7"><DarkSummary label="Destination" value={trip.destination}/><DarkSummary label="Plan" value={plan.name}/><DarkSummary label="Your amount" value={money(plan.price)}/><DarkSummary label="Price tolerance" value="±5%"/></div><div className="mt-7 rounded-2xl bg-white/[.06] p-5"><p className="text-xs uppercase tracking-[.14em] text-white/35">Financial rule</p><p className="mt-2 text-sm leading-6 text-white/70">Your approval is consent, not capture. Voyager will not treat the button press as a hidden charge.</p></div>{req.find(m=>m.user_id===undefined)?null:<div className="mt-7 grid gap-3 sm:grid-cols-2"><button disabled={loading||req[0]?.status==="approved"||req[0]?.status==="declined"} onClick={onApprove} className="rounded-full bg-white py-4 text-sm font-semibold text-black disabled:opacity-35">Approve {money(plan.price)}</button><button disabled={loading||req[0]?.status==="approved"||req[0]?.status==="declined"} onClick={onDecline} className="rounded-full border border-white/15 py-4 text-sm font-semibold">Decline</button></div>}<button disabled={!ready||loading} onClick={onContinue} className="mt-3 w-full rounded-full border border-white/10 bg-white/[.05] py-4 text-sm font-semibold disabled:opacity-30">Continue to payment authorization →</button></div></div></section>
}

function PaymentScreen({trip,plan,count,loading,onBack,onAuthorize}:{trip:Trip;plan:Plan;count:number;loading:boolean;onBack:()=>void;onAuthorize:()=>void}){const total=plan.price*count;return <section className="mx-auto max-w-6xl px-5 py-12 md:px-10 md:py-14"><button onClick={onBack} className="text-sm text-black/50">← Booking consent</button><div className="mx-auto mt-10 max-w-4xl rounded-[34px] border border-black/10 bg-white p-8 shadow-[0_20px_70px_rgba(0,0,0,.05)]"><p className="text-[11px] uppercase tracking-[.2em] text-black/35">Payment authorization</p><h1 className="mt-2 text-4xl font-semibold">Consent is complete. Authorization is next.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-black/55">Authorization and capture remain separate states. Voyager never equates group approval with money movement.</p><div className="mt-9 grid gap-4 md:grid-cols-3"><CardMetric title="Per traveller" value={money(plan.price)}/><CardMetric title="Travellers" value={String(count)}/><CardMetric title="Authorization amount" value={money(total)}/></div><div className="mt-7 grid gap-3 md:grid-cols-4"><StateTile label="Consent" value="Approved" done/><StateTile label="Authorization" value="Pending"/><StateTile label="Booking" value="Locked"/><StateTile label="Capture" value="Locked"/></div><button disabled={loading} onClick={onAuthorize} className="mt-8 w-full rounded-full bg-black py-4 text-sm font-semibold text-white disabled:opacity-40">{loading?"Contacting payment rail…":`Authorize ${money(total)} →`}</button><p className="mt-3 text-center text-xs text-black/35">Provider credentials belong on the server, never in the browser.</p></div></section>}

function ExecutionScreen({trip,plan,count,onBack,onMonitoring,onRecovery}:{trip:Trip;plan:Plan;count:number;onBack:()=>void;onMonitoring:()=>void;onRecovery:()=>void}){return <section className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-14"><button onClick={onBack} className="text-sm text-black/50">← Dashboard</button><div className="mt-8 flex justify-between gap-5"><div><p className="text-[11px] uppercase tracking-[.2em] text-black/35">Execution workspace</p><h1 className="mt-2 text-5xl font-semibold tracking-[-.055em]">{trip.destination}</h1><p className="mt-3 text-sm text-black/50">{plan.name} · {count} financially affected travellers</p></div><span className="rounded-full bg-[#e3f3e6] px-4 py-2 text-xs font-semibold text-[#2d7042]">Payment authorized</span></div><div className="mt-10 grid gap-5 lg:grid-cols-[1.08fr_.92fr]"><div className="rounded-[32px] border border-black/10 bg-white p-7"><p className="text-xs uppercase tracking-[.16em] text-black/35">State machine</p><div className="mt-7 space-y-4"><ExecutionItem title="Group consent" detail={`${count}/${count} required approvals`} done/><ExecutionItem title="Payment authorization" detail="Protected payment state reached" done/><ExecutionItem title="Provider booking" detail="Live travel connector required"/><ExecutionItem title="Payment capture" detail="Separate reconciliation step"/><ExecutionItem title="Confirmation" detail="Provider returns booking reference"/></div></div><div className="rounded-[32px] bg-[#181818] p-7 text-white"><p className="text-[11px] uppercase tracking-[.18em] text-white/35">Trip control</p><h2 className="mt-2 text-3xl font-semibold">{money(plan.price*trip.travellers)}</h2><p className="mt-1 text-sm text-white/45">planned group commitment</p><DarkSummary label="Route" value={plan.route.join(" → ")}/><DarkSummary label="Stay" value={plan.hotel}/><DarkSummary label="Transport" value={plan.transport}/><button onClick={onMonitoring} className="mt-7 w-full rounded-full bg-white py-4 text-sm font-semibold text-black">Open monitoring →</button><button onClick={onRecovery} className="mt-3 w-full rounded-full border border-white/15 py-4 text-sm font-semibold">Recovery workspace</button></div></div></section>}

function MonitoringScreen({trip,plan,onBack,onSimulate}:{trip:Trip;plan:Plan;onBack:()=>void;onSimulate:()=>void}){return <section className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-14"><button onClick={onBack} className="text-sm text-black/50">← Execution</button><div className="mt-8 grid gap-5 lg:grid-cols-[1fr_.9fr]"><div className="rounded-[32px] border border-black/10 bg-white p-7"><p className="text-[11px] uppercase tracking-[.2em] text-black/35">Monitoring</p><h1 className="mt-2 text-4xl font-semibold">Voyager knows what it is supposed to watch.</h1><p className="mt-4 text-sm leading-7 text-black/55">Production monitoring is connector-backed. The demo trigger below is explicit so Voyager never pretends a live feed exists when it does not.</p><div className="mt-8 space-y-3"><MonitorRow title="Booking status" value="Provider connector required"/><MonitorRow title="Transport changes" value="Webhook / polling connector required"/><MonitorRow title="Hotel changes" value="Provider webhook / polling connector required"/><MonitorRow title="Downstream impact" value="Recovery engine ready"/></div></div><div className="rounded-[32px] bg-[#181818] p-7 text-white"><p className="text-[11px] uppercase tracking-[.2em] text-white/35">Demo trigger</p><h2 className="mt-2 text-3xl font-semibold">Simulate a disruption.</h2><p className="mt-3 text-sm leading-6 text-white/65">This explicitly enters recovery demo mode. In production, a real provider event would trigger this state.</p><DarkSummary label="Trip" value={trip.destination}/><DarkSummary label="Plan" value={plan.name}/><button onClick={onSimulate} className="mt-7 w-full rounded-full bg-white py-4 text-sm font-semibold text-black">Simulate disruption →</button></div></div></section>}

function RecoveryScreen({trip,plan,onBack,onResolve}:{trip:Trip;plan:Plan;onBack:()=>void;onResolve:()=>void}){const affected=4,delta=1850;return <section className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-14"><button onClick={onBack} className="text-sm text-black/50">← Monitoring</button><div className="mt-8 grid gap-5 lg:grid-cols-[1fr_.9fr]"><div className="rounded-[32px] border border-black/10 bg-white p-7"><span className="rounded-full bg-[#fff0e8] px-3 py-1.5 text-xs font-semibold text-[#a43827]">Disruption · demo</span><h1 className="mt-5 text-4xl font-semibold">The morning flight was cancelled.</h1><p className="mt-4 text-sm leading-7 text-black/55">Voyager finds alternatives and calculates the downstream impact before requesting a new financial decision.</p><div className="mt-8 grid gap-3 sm:grid-cols-3"><MiniStat label="Current approved" value={`${money(plan.price)} / person`}/><MiniStat label="Replacement" value={`${money(plan.price+delta)} / person`}/><MiniStat label="Additional cost" value={`+${money(delta)} / person`}/></div><div className="mt-7 space-y-3"><RecoveryOption name="Option A" price="+₹450 / person" detail="Slightly later arrival; downstream unchanged"/><RecoveryOption name="Option B" price={`+${money(delta)} / person`} detail="Keeps the arrival window and current hotel" recommended/><RecoveryOption name="Option C" price="₹0 extra" detail="Much later arrival; transfer may need revision"/></div></div><div className="rounded-[32px] bg-[#181818] p-7 text-white"><p className="text-[11px] uppercase tracking-[.2em] text-white/35">Recovery consent</p><h2 className="mt-2 text-3xl font-semibold">{affected} travellers affected.</h2><DarkSummary label="Current" value={`${money(plan.price)} / person`}/><DarkSummary label="New" value={`${money(plan.price+delta)} / person`}/><DarkSummary label="Delta" value={`+${money(delta)} / person`}/><div className="mt-7 rounded-2xl bg-white/[.06] p-5"><p className="text-xs uppercase tracking-[.14em] text-white/35">Symmetric rule</p><p className="mt-2 text-sm leading-6 text-white/70">Only affected travellers approve. Any decline or expiry blocks recovery until resolved. No partial rebooking.</p></div><button onClick={onResolve} className="mt-7 w-full rounded-full bg-white py-4 text-sm font-semibold text-black">Open affected-traveller consent →</button></div></div></section>}

function ProfileScreen({name,email,avatarUrl,saving,onBack,onName,onSave,onPermissions}:{name:string;email:string;avatarUrl:string;saving:boolean;onBack:()=>void;onName:(x:string)=>void;onSave:()=>void;onPermissions:()=>void}){return <section className="mx-auto max-w-5xl px-5 py-12 md:px-10 md:py-14"><button onClick={onBack} className="text-sm text-black/50">← Dashboard</button><div className="mt-8"><p className="text-[11px] uppercase tracking-[.2em] text-black/35">Your profile</p><h1 className="mt-2 text-5xl font-semibold tracking-[-.055em]">Make Voyager yours.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-black/55">Your identity, travel preferences and agent permissions live here. Account authentication remains with your sign-in provider.</p></div><div className="mt-10 grid gap-5 lg:grid-cols-[.65fr_1.35fr]"><div className="rounded-[30px] bg-[#181818] p-7 text-white"><div className="grid h-24 w-24 place-items-center overflow-hidden rounded-[28px] bg-white/10 text-3xl font-semibold">{avatarUrl?<img src={avatarUrl} alt="" className="h-full w-full object-cover"/>:name.slice(0,1).toUpperCase()}</div><p className="mt-7 text-xs uppercase tracking-[.18em] text-white/35">Signed in</p><p className="mt-2 text-lg font-semibold break-all">{email}</p><div className="mt-7 rounded-2xl bg-white/[.06] p-5"><p className="text-xs text-white/35">Account boundary</p><p className="mt-2 text-sm leading-6 text-white/65">Voyager can coordinate travel, but sensitive payment credentials stay with payment rails.</p></div></div><div className="space-y-5"><div className="rounded-[30px] border border-black/10 bg-white p-7"><p className="text-xs uppercase tracking-[.16em] text-black/35">Personal details</p><div className="mt-6"><Field label="Display name" value={name} onChange={onName}/><p className="mt-2 text-xs text-black/40">This is the name other travellers see in Trip Rooms.</p></div><button onClick={onSave} disabled={saving} className="mt-7 rounded-full bg-black px-6 py-3.5 text-sm font-semibold text-white disabled:opacity-40">{saving?"Saving…":"Save changes"}</button></div><div className="rounded-[30px] border border-black/10 bg-white p-7"><p className="text-xs uppercase tracking-[.16em] text-black/35">Agent settings</p><p className="mt-2 text-xl font-semibold">Set your boundaries</p><p className="mt-2 text-sm leading-6 text-black/50">Choose what Voyager can research, remind, replan, spend or cancel.</p><button onClick={onPermissions} className="mt-6 rounded-full border border-black/10 px-5 py-3 text-sm font-semibold">Open agent controls →</button></div></div></div></section>}

function PermissionsScreen({values,onBack,onToggle}:{values:PermissionMap;onBack:()=>void;onToggle:(k:PermissionKey)=>void}){return <section className="mx-auto max-w-4xl px-5 py-12 md:px-10 md:py-14"><button onClick={onBack} className="text-sm text-black/50">← Profile</button><p className="mt-8 text-[11px] uppercase tracking-[.2em] text-black/35">Agent controls</p><h1 className="mt-2 text-5xl font-semibold tracking-[-.055em]">You decide how much Voyager can do.</h1><div className="mt-10 overflow-hidden rounded-[30px] border border-black/10 bg-white">{[["research","Research and comparison","Search and compare routes, stays, activities and policies.",false],["reminders","Send reminders","Remind travellers who have not responded.",false],["replanning","Replan within approved budget","Suggest alternatives without moving money.",false],["spending","Spend money automatically","High-impact action. Keep off unless explicitly intended.",true],["cancellation","Cancel irreversible bookings","High-impact action. Keep off by default.",true]].map(([key,title,description,warning])=><PermissionRow key={key as string} title={title as string} description={description as string} enabled={values[key as PermissionKey]} warning={Boolean(warning)} onToggle={()=>onToggle(key as PermissionKey)}/>)}</div></section>}

function CreateTripModal({trip,working,onClose,onSubmit,onChange,allCities}:{trip:any;working:boolean;onClose:()=>void;onSubmit:(e:FormEvent)=>void;onChange:(x:any)=>void;allCities:(q:string)=>string[]}) {
  const [query,setQuery]=useState("");
  const [dragged,setDragged]=useState<number|null>(null);

  function reorder(from:number,to:number){
    if(from===to)return;
    const stops=[...trip.stops];
    const [item]=stops.splice(from,1);
    stops.splice(to,0,item);
    onChange({...trip,stops});
  }

  function removeStop(index:number){
    onChange({...trip,stops:trip.stops.filter((_:string,i:number)=>i!==index)});
    if(dragged===index)setDragged(null);
  }

  function setStop(index:number,value:string){
    const stops=[...trip.stops];
    stops[index]=value;
    onChange({...trip,stops});
  }

  function addStop(){
    onChange({...trip,stops:[...trip.stops,""]});
    requestAnimationFrame(()=>anime({targets:".voyager-new-stop",scale:[.97,1],opacity:[0,.96],duration:520,easing:"easeOutElastic(1,.55)"}));
  }

  const suggestions=allCities(query);

  return <Modal>
    <motion.div
      initial={{opacity:0,scale:.97,y:18}}
      animate={{opacity:1,scale:1,y:0}}
      transition={{duration:.42,ease:[.22,.8,.24,1]}}
      className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-[38px] border border-white/50 bg-[#f7f6f2]/96 p-5 shadow-[0_35px_120px_rgba(0,0,0,.22)] backdrop-blur-2xl md:p-7"
    >
      <ModalHeader eyebrow="New trip" title="Build the route like a living map." description="Start anywhere, add as many stops as you need, move them into order, then let Voyager optimise the whole journey around your group's constraints." onClose={onClose}/>

      <form onSubmit={onSubmit} className="mt-7 grid gap-5 lg:grid-cols-[1.12fr_.88fr]">
        <div className="rounded-[30px] border border-black/8 bg-white p-5 md:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-black/35">01 · Route</p>
              <p className="mt-1 text-sm text-black/45">Add, remove and reorder every stop.</p>
            </div>
            <span className="rounded-full bg-[#edf1eb] px-3 py-1.5 text-[11px] font-semibold text-[#356247]">{trip.stops.filter((s:string)=>s.trim()).length+1} locations</span>
          </div>

          <label className="mt-6 block">
            <span className="mb-2 block text-xs font-medium text-black/45">Starting location</span>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-black/35">01</span>
              <input value={trip.origin} onChange={e=>onChange({...trip,origin:e.target.value})} placeholder="Delhi" className="w-full rounded-[20px] border border-black/10 bg-[#faf9f6] py-4 pl-12 pr-4 text-sm font-medium outline-none transition focus:border-black/30 focus:bg-white"/>
            </div>
          </label>

          <div className="mt-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold">Stops</p>
                <p className="mt-1 text-[11px] text-black/35">Drag with the handle, or use ↑ ↓.</p>
              </div>
              <button type="button" onClick={addStop} className="rounded-full bg-black px-4 py-2.5 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg">+ Add stop</button>
            </div>

            <div className="mt-4 rounded-[26px] bg-[#faf9f6] p-3">
              <div className="relative">
                <div className="absolute left-[17px] top-6 bottom-6 w-px bg-gradient-to-b from-black/25 via-black/8 to-transparent"/>
                <div className="space-y-2">
                  {trip.stops.map((stop:string,i:number)=>
                    <div
                      key={`${i}-${stop}`}
                      draggable
                      onDragStart={()=>setDragged(i)}
                      onDragOver={e=>e.preventDefault()}
                      onDrop={()=>{if(dragged!==null)reorder(dragged,i);setDragged(null)}}
                      onDragEnd={()=>setDragged(null)}
                      className={`voyager-new-stop relative flex items-start gap-3 rounded-[20px] p-2 transition duration-300 ${dragged===i?"scale-[.985] bg-white opacity-60 shadow-lg":"hover:bg-white/70"}`}
                    >
                      <div className="relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black text-[11px] font-bold text-white shadow-sm">
                        {i+2}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 rounded-[18px] border border-black/8 bg-white p-2 shadow-sm">
                          <span className="cursor-grab select-none px-1 text-sm text-black/25 active:cursor-grabbing">⠿</span>
                          <input value={stop} placeholder={`Stop ${i+2}`} onChange={e=>{setStop(i,e.target.value);setQuery(e.target.value)}} className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm font-medium outline-none"/>
                          <button type="button" onClick={()=>removeStop(i)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-black/35 transition hover:bg-black hover:text-white">×</button>
                        </div>
                        <div className="mt-2 flex gap-1.5 pl-2">
                          <button type="button" disabled={i===0} onClick={()=>reorder(i,i-1)} className="rounded-full border border-black/8 bg-white px-2.5 py-1.5 text-[10px] font-semibold disabled:opacity-20">↑ Move</button>
                          <button type="button" disabled={i===trip.stops.length-1} onClick={()=>reorder(i,i+1)} className="rounded-full border border-black/8 bg-white px-2.5 py-1.5 text-[10px] font-semibold disabled:opacity-20">↓ Move</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {query&&suggestions.length>0&&
                <div className="mt-2 overflow-hidden rounded-[18px] border border-black/8 bg-white shadow-xl">
                  <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[.15em] text-black/30">Suggestions</div>
                  {suggestions.map(city=>
                    <button
                      type="button"
                      key={city}
                      onClick={()=>{
                        const idx=trip.stops.findIndex((s:string)=>s.toLowerCase().includes(query.toLowerCase()));
                        if(idx>=0)setStop(idx,city); else onChange({...trip,stops:[...trip.stops,city]});
                        setQuery("");
                      }}
                      className="flex w-full items-center justify-between px-3 py-3 text-left text-sm transition hover:bg-[#f6f4ef]"
                    >
                      <span>{city}</span><span className="text-xs text-black/25">Add →</span>
                    </button>
                  )}
                </div>
              }
            </div>

            <div className="mt-4 rounded-[24px] border border-black/8 bg-[#f5f2ea] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-black/35">Route preview</p>
              <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 voyager-scrollbar">
                {[trip.origin,...trip.stops].map((city:string,i:number)=>
                  <React.Fragment key={`${city}-${i}`}>
                    <motion.span layout className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-semibold ${i===0?"bg-black text-white":"bg-white border border-black/8"}`}>{i+1} · {city||"Add stop"}</motion.span>
                    {i<trip.stops.length&&<span className="shrink-0 text-black/20">→</span>}
                  </React.Fragment>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[30px] bg-[#151515] p-5 text-white md:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-white/35">02 · Trip brief</p>
          <h3 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Give Voyager the constraints.</h3>
          <p className="mt-2 text-sm leading-6 text-white/48">The more specific the brief, the better the agent can trade off time, comfort and cost.</p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <DatePickerField label="Start date" value={trip.startDate} onChange={v=>onChange({...trip,startDate:v})} dark/>
            <DatePickerField label="End date" value={trip.endDate} onChange={v=>onChange({...trip,endDate:v})} dark/>
            <DarkField label="Travellers"><input type="number" min={1} value={trip.travellers} onChange={e=>onChange({...trip,travellers:Math.max(1,Number(e.target.value)||1)})} className="dark-input"/></DarkField>
            <DarkField label="Budget / person"><input type="number" min={1000} value={trip.budget} onChange={e=>onChange({...trip,budget:Math.max(1000,Number(e.target.value)||1000)})} className="dark-input"/></DarkField>
          </div>

          <div className="mt-6">
            <p className="text-xs text-white/45">Travel style</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["Relaxed","Balanced","Adventure","Luxury"] as TravelStyle[]).map(style=>
                <button key={style} type="button" onClick={()=>onChange({...trip,style})} className={`rounded-[17px] border py-3 text-xs font-semibold transition ${trip.style===style?"border-white bg-white text-black":"border-white/10 bg-white/[.035] text-white/65 hover:bg-white/[.08]"}`}>{style}</button>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-white/8 bg-white/[.045] p-5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[.18em] text-white/35">Agent preview</p>
              <span className="rounded-full bg-[#dff1e4] px-2.5 py-1 text-[9px] font-bold text-[#2d7042]">READY</span>
            </div>
            <p className="mt-3 text-lg font-semibold">{routePreviewLabel(trip.origin,trip.stops)}</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-[16px] bg-white/[.05] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/30">People</p><p className="mt-1 text-sm font-semibold">{trip.travellers}</p></div>
              <div className="rounded-[16px] bg-white/[.05] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/30">Budget</p><p className="mt-1 text-sm font-semibold">{money(trip.budget)}</p></div>
              <div className="rounded-[16px] bg-white/[.05] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/30">Style</p><p className="mt-1 text-sm font-semibold">{trip.style}</p></div>
            </div>
          </div>

          <button disabled={working} type="submit" className="mt-7 w-full rounded-full bg-white py-4 text-sm font-semibold text-black transition hover:scale-[1.01] hover:shadow-2xl disabled:opacity-40">
            {working?"Creating your workspace…":"Create trip & open Trip Room →"}
          </button>
        </div>
      </form>
    </motion.div>
  </Modal>
}


function DatePickerField({label,value,onChange,dark=false}:{label:string;value:string;onChange:(v:string)=>void;dark?:boolean}) {
  const [open,setOpen]=useState(false);
  const date=value?new Date(`${value}T00:00:00`):new Date();
  const [month,setMonth]=useState(new Date(date.getFullYear(),date.getMonth(),1));

  useEffect(()=>{ if(value) setMonth(new Date(date.getFullYear(),date.getMonth(),1)); },[value]);

  const year=month.getFullYear();
  const monthIndex=month.getMonth();
  const firstDay=new Date(year,monthIndex,1).getDay();
  const days=new Date(year,monthIndex+1,0).getDate();
  const cells=[...Array(firstDay).fill(null),...Array(days).fill(null).map((_,i)=>i+1)];
  const selected=value;

  function toValue(day:number){
    const m=String(monthIndex+1).padStart(2,"0");
    const d=String(day).padStart(2,"0");
    return `${year}-${m}-${d}`;
  }

  return (
    <div className="relative">
      <span className={`mb-2 block text-xs ${dark?"text-white/45":"text-black/45"}`}>{label}</span>
      <button type="button" onClick={()=>setOpen(v=>!v)} className={`flex w-full items-center justify-between rounded-[18px] border px-3.5 py-3.5 text-left transition ${dark?"border-white/10 bg-white/[.04] text-white hover:bg-white/[.07]":"border-black/10 bg-white text-black hover:bg-[#faf9f6]"}`}>
        <span>
          <span className="block text-[10px] uppercase tracking-[.15em] opacity-35">Travel date</span>
          <span className="mt-1 block text-sm font-semibold">{formatDateLong(value)}</span>
        </span>
        <span className="grid h-9 w-9 place-items-center rounded-full border border-current/10 text-xs opacity-60">▣</span>
      </button>
      {open&&(
        <motion.div initial={{opacity:0,y:8,scale:.98}} animate={{opacity:1,y:0,scale:1}} className="absolute left-0 right-0 top-[76px] z-[90] rounded-[24px] border border-black/10 bg-white p-4 text-black shadow-[0_25px_80px_rgba(0,0,0,.2)]">
          <div className="flex items-center justify-between">
            <button type="button" onClick={()=>setMonth(new Date(year,monthIndex-1,1))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/5">‹</button>
            <p className="text-sm font-semibold">{month.toLocaleString("en-IN",{month:"long",year:"numeric"})}</p>
            <button type="button" onClick={()=>setMonth(new Date(year,monthIndex+1,1))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/5">›</button>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[9px] font-semibold uppercase tracking-[.1em] text-black/30">{["S","M","T","W","T","F","S"].map((d,i)=><span key={`${d}-${i}`}>{d}</span>)}</div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {cells.map((day,i)=> day===null?<span key={`blank-${i}`} className="h-9"/>:
              <button type="button" key={`${day}-${i}`} onClick={()=>{onChange(toValue(day));setOpen(false)}} className={`grid h-9 place-items-center rounded-full text-xs transition ${selected===toValue(day)?"bg-black text-white":"hover:bg-black/5"}`}>{day}</button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function formatDateLong(v?:string){
  if(!v)return "Choose date";
  const d=new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime())?"Choose date":d.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
}

function routePreviewLabel(origin:string,stops:string[]){
  const clean=[origin,...stops].map(s=>s.trim()).filter(Boolean);
  return clean.length?clean.join(" → "):"Add a route";
}

function DarkField({label,children}:{label:string;children:ReactNode}){
  return <label className="block"><span className="mb-2 block text-xs text-white/45">{label}</span>{children}</label>;
}

function PreferenceModal({value,onClose,onChange,onSubmit}:{value:any;onClose:()=>void;onChange:(x:any)=>void;onSubmit:()=>void}){return <Modal><div className="rounded-[34px] bg-[#f7f6f2] p-7 md:p-8"><ModalHeader eyebrow="Traveller preferences" title="What matters to you?" description="Select multiple priorities. Voyager uses their overlap together." onClose={onClose}/><div className="mt-8"><ChoiceGroup label="Comfortable budget" options={["₹20K","₹30K","₹40K+"]} selected={value.budget} onSelect={v=>onChange({...value,budget:v})}/><div className="mt-6"><ChoiceGroup label="Accommodation" options={["Budget","Balanced","Premium"]} selected={value.stay} onSelect={v=>onChange({...value,stay:v})}/></div><div className="mt-6"><p className="text-xs font-medium text-black/45">Top priorities · multi-select</p><div className="mt-2 flex flex-wrap gap-2">{PRIORITIES.map(p=><button type="button" key={p} onClick={()=>onChange({...value,priorities:value.priorities.includes(p)?value.priorities.filter((x:string)=>x!==p):[...value.priorities,p]})} className={`rounded-full border px-4 py-2.5 text-sm ${value.priorities.includes(p)?"border-black bg-black text-white":"border-black/10 bg-white"}`}>{p}</button>)}</div><p className="mt-3 text-xs text-black/40">{value.priorities.length} selected</p></div></div><button onClick={onSubmit} className="mt-8 w-full rounded-full bg-black py-4 text-sm font-semibold text-white">Save preferences →</button></div></Modal>}
function InviteModal({trip,generated,working,onClose,onCopy}:{trip:Trip;generated:boolean;working:boolean;onClose:()=>void;onCopy:()=>void}){return <Modal><div className="rounded-[34px] bg-[#f7f6f2] p-7 md:p-8"><ModalHeader eyebrow="Invite your group" title="Bring everyone into the Trip Room." description="One secure link. Every traveller signs in and makes their own decision." onClose={onClose}/><div className="mt-8 rounded-2xl border border-black/10 bg-white p-5"><p className="text-xs text-black/40">Secure invitation</p><p className="mt-2 text-sm font-semibold">{trip.destination}</p><p className="mt-1 text-xs text-black/40">The token stays hidden from this panel.</p></div>{generated&&<div className="mt-4 rounded-2xl bg-[#e3f3e6] p-4 text-sm font-medium text-[#2d7042]">Invite copied.</div>}<div className="mt-5 grid gap-3 sm:grid-cols-2"><button disabled={working} onClick={onCopy} className="rounded-full bg-black py-3.5 text-sm font-semibold text-white disabled:opacity-40">{working?"Preparing…":"Copy secure invite"}</button><button onClick={onClose} className="rounded-full border border-black/10 py-3.5 text-sm font-semibold">Done</button></div></div></Modal>}
function Modal({children}:{children:ReactNode}){return <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4 backdrop-blur-md">{children}</motion.div>}
function ModalHeader({eyebrow,title,description,onClose}:{eyebrow:string;title:string;description:string;onClose:()=>void}){return <div className="flex justify-between gap-4"><div><p className="text-[11px] uppercase tracking-[.18em] text-black/35">{eyebrow}</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-black/50">{description}</p></div><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-black/10 bg-white">×</button></div>}
function Field({label,placeholder,type="text",value,onChange}:{label:string;placeholder?:string;type?:string;value:string;onChange:(x:string)=>void}){return <label className="block"><span className="mb-2 block text-xs font-medium text-black/50">{label}</span><input type={type} value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm text-[#171717] outline-none focus:border-black/30"/></label>}
function ChoiceGroup({label,options,selected,onSelect}:{label:string;options:string[];selected:string;onSelect:(x:string)=>void}){return <div><p className="mb-2 text-xs font-medium text-black/45">{label}</p><div className={`grid gap-2 ${options.length===4?"grid-cols-2 md:grid-cols-4":"grid-cols-3"}`}>{options.map(o=><button type="button" key={o} onClick={()=>onSelect(o)} className={`rounded-2xl border py-3 text-sm font-medium ${selected===o?"border-black bg-black text-white":"border-black/10 bg-white"}`}>{o}</button>)}</div></div>}
function Info({label,value}:{label:string;value:string}){return <div><p className="text-xs text-black/40">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>}
function Pillar({n,title,text}:{n:string;title:string;text:string}){return <motion.div whileHover={{y:-5}} className="rounded-[26px] border border-black/10 bg-[#f7f6f2] p-7"><p className="text-sm font-semibold text-black/30">{n}</p><h3 className="mt-10 text-2xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-black/55">{text}</p></motion.div>}
function DarkMetric({label,value,sub}:{label:string;value:string;sub:string}){return <div className="rounded-2xl bg-white/[.06] p-4"><p className="text-[10px] uppercase tracking-[.12em] text-white/35">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p><p className="mt-1 text-xs text-white/40">{sub}</p></div>}
function DarkSummary({label,value}:{label:string;value:string}){return <div className="flex justify-between gap-4 border-b border-white/10 py-3 last:border-0"><span className="text-sm text-white/40">{label}</span><span className="max-w-[65%] text-right text-sm font-medium text-white/80">{value}</span></div>}
function DetailRow({label,value}:{label:string;value:string}){return <div className="flex justify-between gap-4 border-b border-black/6 py-3 last:border-0"><span className="text-xs text-black/40">{label}</span><span className="max-w-[68%] text-right text-xs font-semibold">{value}</span></div>}
function MiniStat({label,value}:{label:string;value:string}){return <div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-xs text-black/40">{label}</p><p className="mt-1 text-sm font-semibold leading-5">{value}</p></div>}
function CardMetric({title,value}:{title:string;value:string}){return <div className="rounded-[24px] border border-black/10 bg-[#faf9f6] p-5"><p className="text-xs text-black/40">{title}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>}
function StateTile({label,value,done=false}:{label:string;value:string;done?:boolean}){return <div className={`rounded-2xl border p-4 ${done?"border-black bg-white":"border-black/10 bg-[#faf9f6]"}`}><p className="text-xs text-black/40">{label}</p><p className="mt-2 text-sm font-semibold">{value}</p></div>}
function ExecutionItem({title,detail,done=false}:{title:string;detail:string;done?:boolean}){return <div className="flex items-start gap-4 rounded-2xl border border-black/8 bg-[#faf9f6] p-4"><div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${done?"bg-black text-white":"border border-black/10 bg-white text-black/25"}`}>{done?"✓":"•"}</div><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-black/45">{detail}</p></div></div>}
function MonitorRow({title,value}:{title:string;value:string}){return <div className="flex justify-between gap-4 rounded-2xl border border-black/10 bg-[#faf9f6] p-4"><p className="text-sm font-semibold">{title}</p><span className="text-xs text-black/45">{value}</span></div>}
function RecoveryOption({name,price,detail,recommended=false}:{name:string;price:string;detail:string;recommended?:boolean}){return <motion.div whileHover={{x:3}} className={`rounded-2xl border p-5 ${recommended?"border-black bg-[#faf9f6]":"border-black/10 bg-white"}`}><div className="flex justify-between gap-4"><div><p className="text-sm font-semibold">{name}</p><p className="mt-1 text-xs leading-5 text-black/45">{detail}</p></div><div className="text-right">{recommended&&<span className="mb-2 inline-block rounded-full bg-black px-2.5 py-1 text-[10px] text-white">Recommended</span>}<p className="text-sm font-semibold">{price}</p></div></div></motion.div>}
function VerificationRow({title,score,detail}:{title:string;score:number;detail:string}){return <div className="rounded-2xl border border-black/10 bg-[#faf9f6] p-4"><div className="flex justify-between"><p className="text-sm font-semibold">{title}</p><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold">{score}/25</span></div><div className="mt-3 h-1.5 rounded-full bg-black/5"><motion.div initial={{width:0}} animate={{width:`${score*4}%`}} className="h-full rounded-full bg-black"/></div><p className="mt-2 text-xs leading-5 text-black/45">{detail}</p></div>}
function PermissionRow({title,description,enabled,onToggle,warning=false}:{title:string;description:string;enabled:boolean;onToggle:()=>void;warning?:boolean}){return <div className="flex items-center justify-between gap-5 border-b border-black/8 p-6 last:border-0"><div><div className="flex items-center gap-2"><p className="text-sm font-semibold">{title}</p>{warning&&<span className="rounded-full bg-[#fff0e8] px-2 py-1 text-[10px] font-semibold text-[#a43827]">High impact</span>}</div><p className="mt-1 max-w-xl text-xs leading-5 text-black/45">{description}</p></div><button onClick={onToggle} className={`relative h-7 w-12 shrink-0 rounded-full ${enabled?"bg-black":"bg-black/15"}`}><motion.span animate={{x:enabled?20:0}} className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white"/></button></div>}
