# Voyager ✈️

> **The AI travel agent for groups — from “Where should we go?” to “It’s booked.”**

Voyager is an AI-powered group travel platform designed to remove the hardest parts of travelling with friends, family, and other groups.

Most travel tools are built around **search and booking**. Voyager focuses on the work that happens between them: **collecting preferences, reaching group consensus, comparing options, verifying choices, coordinating the itinerary, and eventually executing the trip.**

## Why Voyager?

Planning a group trip often becomes an unpaid project manager role for one person.

A typical trip can involve:

- different budgets and preferences
- endless group-chat discussions
- comparing flights, hotels, activities, and transport
- checking whether listings and reviews are trustworthy
- collecting approvals and payments
- rebuilding the plan when prices or bookings change

**Voyager's goal is to turn that coordination problem into an agentic workflow.**

## Core Experience

```text
Create Trip
    ↓
Invite Travellers
    ↓
Collect Preferences
    ↓
AI Consensus
    ↓
Generate Trip Options
    ↓
Verify Choices
    ↓
Group Approval
    ↓
Itinerary + Budget
    ↓
Booking / Execution
    ↓
Ongoing Trip Management
```

### 1. Trip Room

Create a shared trip with:

- destination and dates
- traveller count
- budget per person
- travel style and interests
- constraints and preferences

Each traveller can contribute independently rather than relying on one person to represent the whole group.

### 2. AI Consensus

Voyager aggregates individual preferences and identifies conflicts.

Instead of returning dozens of search results, it aims to produce a small number of **explainable options** and show the trade-offs behind them.

### 3. Verification

Before a group commits to an option, Voyager is designed to evaluate factors such as:

- location
- recent reviews
- amenities
- cancellation conditions
- price and hidden costs
- consistency across available sources

### 4. Agentic Execution

The long-term goal is for Voyager to move beyond recommendations and help execute the trip:

- prepare and coordinate bookings
- maintain confirmations
- track the shared itinerary
- coordinate payments
- send reminders
- assist with cancellations and changes
- propose alternatives when disruptions occur

## Product Vision

Voyager is **not another travel chatbot**.

The product vision is:

> **An AI agent that takes responsibility for the messy coordination layer of group travel.**

A user should be able to say:

> “Plan a 5-day Goa trip for six people, keep everyone under ₹30,000, get the group to agree, and prepare the trip.”

Voyager should progressively handle the workflow instead of leaving the user with another list of links.

## Current Status

🚧 **Early-stage prototype / active development**

The current repository contains the initial Voyager web application and product prototype. Travel booking, live travel-provider integrations, automated payments, and full autonomous execution are part of the longer-term roadmap and should not be treated as production functionality yet.

## Tech Stack

- **Next.js 16**
- **React 19**
- **TypeScript**
- **Tailwind CSS**
- **Supabase** (planned/being integrated for application data and auth)
- **Google Gemini API** via `@google/genai`
- **Motion / GSAP / React Spring** for interaction and UI animation
- **Three.js** for future immersive UI experiments
- **Vercel** for deployment

## Roadmap

### Phase 1 — Core MVP
- [x] Initial product prototype
- [ ] Create a trip
- [ ] Invite travellers
- [ ] Preference collection
- [ ] Shared trip dashboard
- [ ] AI-generated itinerary

### Phase 2 — Group Intelligence
- [ ] Preference weighting
- [ ] Conflict detection
- [ ] Consensus engine
- [ ] Budget optimisation
- [ ] Shared decision history

### Phase 3 — Travel Intelligence
- [ ] Live flight search
- [ ] Hotel search
- [ ] Activity discovery
- [ ] Listing/review verification
- [ ] Price and cancellation comparison

### Phase 4 — Agentic Execution
- [ ] Booking workflows
- [ ] Payment coordination
- [ ] Confirmation management
- [ ] Automated reminders
- [ ] Disruption monitoring
- [ ] Rebooking assistance

## Project Origin

Voyager began as a product concept developed around **The Ken Case-Build Competition 2026** and is now being developed independently as a real product exploration.

## Local Development

Clone the repository and install dependencies:

```bash
git clone https://github.com/Anshul3851/Voyager.git
cd Voyager
npm install
```

Create a `.env.local` file for any required API keys and Supabase configuration.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Contributing

Voyager is currently a solo product project. Ideas, issues, and constructive feedback are welcome as the product evolves.

## License

License information will be added as the project matures.
