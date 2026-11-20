/** Steps for Track 0 (Getting started) and Track 1 (Workspaces & projects). */
import { usePrefs } from "../prefs";
import type { StepsDef } from "./index";
import { at, done, nodes, saved } from "./helpers";

export const TRACK_0_1: StepsDef[] = [
  {
    id: "T00", startPath: "/dashboard/tutorials", steps: [
      { title: "Welcome to follow-along tutorials", body: "Each tutorial guides you through the real app. Watch for four helpers: this help box, coloured shout-out boxes, a highlighted area (spotlight) and a pointer. When a step asks you to do something, the app notices and moves on by itself.", shout: { tone: "tip", text: "Nothing in your projects is saved unless you click Save project." } },
      { title: "The spotlight and pointer", body: "The spotlight dims the page except the control you need. Here it highlights the Tutorials link in the sidebar. Click it.", target: "nav:Tutorials", point: "Click here", check: (c) => c.clicked("nav:Tutorials"), waiting: "a click on Tutorials" },
      { title: "Typing detection", body: "Some steps check what you type. Type shark into the search box of the tutorial library.", target: "field:Search tutorials", point: "Type “shark”", check: (c) => c.value("field:Search tutorials").trim().toLowerCase() === "shark", waiting: "the word “shark” in the search box", go: { path: "/dashboard/tutorials" } },
      { title: "Clear the search", body: "Now clear the box again so every tutorial is listed.", target: "field:Search tutorials", check: (c) => c.value("field:Search tutorials") === "", waiting: "an empty search box", go: { path: "/dashboard/tutorials" } },
      { title: "Quick check", body: "Answer in this box. Quizzes appear in icon and beginner tutorials.", quiz: { q: "When does Slyshark store changes to a project?", options: ["Every few seconds automatically", "Only when you click Save project (or press Ctrl+S)", "When you close the browser"], answer: 1, why: "Projects are only stored when you save; until then you can experiment freely and Revert." } },
      { title: "Controls you can always use", body: "Back returns to the previous step. Skip step moves on without doing it. Pause closes the guide; reopen the tutorial from the library to resume where you left off. Press Esc while this box has focus to pause." },
      done("You're ready", "Finished tutorials get a ✓ in the library. A good next step is “Find your way around”."),
    ],
  },
  {
    id: "T01", startPath: "/dashboard/account", title: "Your account and profile", summary: "See how your account works, set the display name Slyshark greets you with, and get to know your Overview page.", steps: [
      { title: "Your account", body: "You created your account on the sign-up page with a display name, a username (3–32 letters, numbers, . _ -), an email and a password. You can sign in with either the username or the email. Let's open your account page.", target: "a[href='/dashboard/account']", point: "Open Account", check: at(/^\/dashboard\/account/), waiting: "the Account page to open" },
      { title: "Your display name", body: "Your display name is what Slyshark greets you with and what reports show as the author. Change it if you like (or keep it).", target: "field:Display name", go: { path: "/dashboard/account" } },
      { title: "Save your profile", body: "Click Save profile. Your email is used to identify the account; it is never shown on share links.", target: "btn:Save profile", point: "Save", check: (c) => c.cmd("profile.update"), waiting: "the profile to be saved", go: { path: "/dashboard/account" } },
      { title: "Back to your Overview", body: "The Overview is your home page: greeting, Getting started checklist, search and recent work.", target: "nav:Overview", point: "Overview", check: at(/^\/dashboard$/), waiting: "the Overview page" },
      { title: "The Getting started checklist", body: "The checklist ticks itself as you create a workspace, map a project, run tests and share. Hide it with × when you're done; you can bring it back in Account → Display.", target: "@getting-started", go: { path: "/dashboard" } },
      done("Profile set", "Each person should have their own account, so reports show who documented and who assessed."),
    ],
  },
  {
    id: "T02", startPath: "/dashboard", steps: [
      { title: "Your work", body: "The top group of the sidebar holds pages that show what you SAVED: Overview, Workspaces & projects and Test runs.", target: "nav:Workspaces & projects", point: "Saved work lives here", check: (c) => c.clicked("nav:Workspaces & projects"), waiting: "a click on Workspaces & projects" },
      { title: "Quick tools are scratch pads", body: "Console, API client, Scanner & audit and Packet captures under “Quick tools · not saved” are for quick checks. Open the Console.", target: "nav:Console", point: "Open Console", check: at(/^\/dashboard\/terminal/), waiting: "the Console page" },
      { title: "Nothing here is stored", body: "The banner explains that quick tools never save. Use “Save as project…” to keep work from a quick tool.", shout: { tone: "warn", text: "Quick tools never save. Use a project when the work is evidence you need to keep." }, target: "btn:Save as project", go: { path: "/dashboard/terminal" } },
      { title: "Help & glossary", body: "Open Help & glossary: getting started, documentation features, console commands, filters and a searchable glossary.", target: "nav:Help & glossary", point: "Open Help", check: at(/^\/dashboard\/help/), waiting: "the Help page" },
      { title: "Search the glossary", body: "Type port in the glossary search to see the definition.", target: "field:Search glossary", point: "Type “port”", check: (c) => c.value("field:Search glossary").toLowerCase().includes("port"), waiting: "“port” in the glossary search", go: { path: "/dashboard/help" } },
      { title: "Open-project tabs", body: "When you open projects, they appear as tabs above the page. An amber dot means unsaved changes. Closing a tab unloads the project from memory (you're asked first if it has unsaved work)." },
      { title: "On a phone", body: "On small screens the sidebar becomes a ☰ menu at the top left. The designer works best on a larger screen; other tabs work well on phones." },
      done("You know your way around", "Next: “Display settings and accessibility” or “Create and organise workspaces”."),
    ],
  },
  {
    id: "T03", startPath: "/dashboard/account", steps: [
      { title: "Open Account", body: "Display settings live on the Account page.", target: "a[href='/dashboard/account']", point: "Account", check: at(/^\/dashboard\/account/), waiting: "the Account page" },
      { title: "Theme", body: "Pick Light, Dark or System (follows your device). Try a different one.", target: "[aria-label=Theme]", point: "Pick a theme", check: (c) => usePrefs.getState().prefs.theme !== (c.startPrefs?.theme ?? "dark"), waiting: "a different theme", go: { path: "/dashboard/account" } },
      { title: "Text size", body: "Choose Large if you prefer bigger text. Every page follows it.", target: "[aria-label='Text size']", point: "Pick a size", check: () => usePrefs.getState().prefs.textSize === "lg", waiting: "text size Large", go: { path: "/dashboard/account" }, optional: true },
      { title: "Learning tips", body: "Learning tips are the ⓘ icons that explain networking and security terms right where you need them. Keep them on while learning.", target: "field:Learning tips", go: { path: "/dashboard/account" } },
      { title: "Start page", body: "Choose where Slyshark opens after sign-in: Overview, Workspaces & projects, or the last project you opened.", target: "field:Start page", go: { path: "/dashboard/account" } },
      done("Display set", "Display settings are saved to your account, so they follow you to every device."),
    ],
  },
  {
    id: "T04", startPath: "/dashboard/account", steps: [
      { title: "Open Account", body: "Account security lives on the Account page.", target: "a[href='/dashboard/account']", check: at(/^\/dashboard\/account/), waiting: "the Account page" },
      { title: "Where you're signed in", body: "The sessions list shows each browser or device signed in to your account; “This device” marks the one you're using.", target: "@sessions", shout: { tone: "tip", text: "See a device you don't recognise? Sign it out and change your password." }, go: { path: "/dashboard/account" } },
      { title: "Change your password (optional)", body: "Enter your current password, then a new one twice. Changing your password signs out your other devices automatically. Skip this step if you don't want to change it now.", target: "field:Current", check: (c) => c.cmd("profile.changePassword"), waiting: "a password change", optional: true, go: { path: "/dashboard/account" } },
      { title: "Lockout protection", body: "After 10 wrong passwords an account is locked for 15 minutes, and repeated sign-ups from one address are slowed down. This protects against password guessing." },
      { title: "Deleting your account", body: "Delete account removes your projects, saved runs and share links permanently. You must type your username and password, so it can't happen by accident. Don't do it now — just know where it is.", target: "@delete-account", shout: { tone: "warn", text: "Export anything you need first: deletion cannot be undone." }, go: { path: "/dashboard/account" } },
      done("Account secured", "Session review and password hygiene are evidence of access management (HIPAA password management, ISO 27001 A.5.17)."),
    ],
  },
  {
    id: "T10", startPath: "/dashboard/workspaces", steps: [
      { title: "Workspaces are folders", body: "Use one workspace per client, site or course. Open Workspaces & projects.", target: "nav:Workspaces & projects", check: at(/^\/dashboard\/workspaces/), waiting: "the Workspaces page" },
      { title: "Create a workspace", body: "Click New workspace, name it (e.g. “Clinic A”) and add a description of what's in scope.", target: "btn:New workspace", point: "New workspace", check: (c) => c.cmd("workspace.create"), waiting: "a new workspace", go: { path: "/dashboard/workspaces" } },
      { title: "Edit it", body: "Each workspace has an edit (✎) button: change its name or description any time.", target: "[aria-label='Edit workspace']", point: "Edit", check: (c) => c.cmd("workspace.update"), waiting: "the workspace to be edited", optional: true, go: { path: "/dashboard/workspaces" } },
      { title: "Switch between workspaces", body: "Click All projects, then your new workspace, to switch the list.", target: "nav[aria-label=Workspaces]", optional: true },
      { title: "Deleting is protected", body: "Deleting a workspace also deletes its projects, so you must type its name to confirm.", target: "[aria-label='Delete workspace']", shout: { tone: "warn", text: "Archive projects you no longer need instead of deleting them; archived work stays restorable." } },
      done("Workspace ready", "Separating clients keeps evidence, reports and share links scoped to the right organisation."),
    ],
  },
  {
    id: "T11", startPath: "/dashboard/workspaces", steps: [
      { title: "Start a new project", body: "Click New project.", target: "btn:New project", point: "New project", check: (c) => c.exists("#np-name"), waiting: "the New project dialog", go: { path: "/dashboard/workspaces" } },
      { title: "Pick a template", body: "Templates give you a ready-made diagram. Choose “Office LAN”.", target: "btn:Office LAN", point: "Office LAN", check: (c) => c.clicked("btn:Office LAN"), waiting: "the Office LAN template" },
      { title: "Name and describe it", body: "Give the project a name and a description of what it documents.", target: "#np-name", check: (c) => c.value("#np-desc").trim().length > 0, waiting: "a description" },
      { title: "Stage", body: "Stage shows how real the environment is: Production, Staging, Development, Lab or Learning. Pick Lab.", target: "#np-stage", check: (c) => c.value("#np-stage") === "lab", waiting: "stage Lab" },
      { title: "Create it", body: "Click Create project. The project opens straight away.", target: "btn:Create project", point: "Create", check: at(/^\/dashboard\/projects\//), waiting: "the new project to open" },
      { title: "Add tags", body: "Tags make projects easy to find (e.g. lab, office, pci). Click the pencil next to the project name, add a tag and save.", target: "[aria-label='Edit project details']", point: "Edit details", check: (c) => (c.meta?.tags.length ?? 0) > 0, waiting: "at least one tag" },
      done("Project created", "Tags and stages make inventories searchable, e.g. every production or PCI system (ISO 27001 A.5.12)."),
    ],
  },
  {
    id: "T12", practice: "office-lan", steps: [
      { title: "The golden rule", body: "Slyshark only stores your project when you click Save project. Until then, every change lives in this browser tab.", shout: { tone: "tip", text: "This is a practice project, so experiment freely." } },
      { title: "Make a change", body: "Click “Router” in the palette on the left to add a router to the diagram.", target: "btn:Add Router", point: "Add a router", check: (c) => nodes(c.state, "router").length > nodes(c.start, "router").length, waiting: "a new router" },
      { title: "Unsaved changes", body: "See the “Unsaved changes” badge, and the amber dot on the project tab above.", target: "@save-status", check: (c) => c.dirty, waiting: "unsaved changes" },
      { title: "Save with a note", body: "Open the ▾ next to Save project and choose “Save with a note…”. Type “Added router” and save.", target: "[aria-label='More save options']", point: "More save options", check: saved, waiting: "a save" },
      { title: "Revert", body: "Add another component, then click Revert to throw that change away.", target: "btn:Revert", point: "Revert", check: (c) => c.clicked("btn:Revert") && !c.dirty, waiting: "a revert", optional: true },
      { title: "Ctrl+S", body: "Press Ctrl+S (⌘S on a Mac) any time to save. When nothing changed, Slyshark says “Already saved”.", check: (c) => c.key("Ctrl+S"), waiting: "Ctrl+S" },
      done("Saving mastered", "Notes become a change log that shows who changed what and why, which is useful change-management evidence."),
    ],
  },
  {
    id: "T13", practice: "office-lan", steps: [
      { title: "Make two saves", body: "History keeps your last 10 saves. Add a component, then save with a note.", target: "btn:Save project", check: saved, waiting: "a save" },
      { title: "Open History", body: "Click History.", target: "btn:History", point: "History", check: (c) => c.exists("[aria-label='Save history']"), waiting: "the History drawer" },
      { title: "Read the list", body: "Each save shows its note, time and number of components. The top one is the current version.", target: "[aria-label='Save history']" },
      { title: "Restore an earlier version", body: "Click Restore on the version before the current one and confirm.", target: "btn:Restore", point: "Restore", check: (c) => c.cmd("project.restoreVersion"), waiting: "a restore" },
      done("History used", "Restoring creates a new save, so nothing is lost. History shows how an environment evolved — useful when an audit asks what changed."),
    ],
  },
  {
    id: "T14", startPath: "/dashboard/workspaces", steps: [
      { title: "Search", body: "Type lab into the search box. It looks in names, descriptions and tags.", target: "field:Search projects", point: "Search", check: (c) => /lab|practice/i.test(c.value("field:Search projects")), waiting: "a search", go: { path: "/dashboard/workspaces" } },
      { title: "Filter by stage", body: "Use the stage filter to show only Lab or Learning projects.", target: "[aria-label='Filter by stage']", check: (c) => c.value("[aria-label='Filter by stage']") !== "all", waiting: "a stage filter", go: { path: "/dashboard/workspaces" } },
      { title: "Sort", body: "Sort by last saved, name or created date.", target: "[aria-label='Sort projects']", optional: true },
      { title: "Pin a project", body: "Open a project card's ⋯ menu and choose Pin to top. Pinned projects appear first and on the Overview.", target: "[aria-label^='Actions for']", point: "⋯ menu", check: (c) => c.cmd("project.updateDetails"), waiting: "a project to be pinned", go: { path: "/dashboard/workspaces" } },
      { title: "Clear filters", body: "Clear the search and stage filters to see everything again.", optional: true },
      done("Finding work fast", "Fast retrieval of the right environment record matters during an audit or an incident."),
    ],
  },
  {
    id: "T15", startPath: "/dashboard/workspaces", steps: [
      { title: "Duplicate a project", body: "Open a card's ⋯ menu and choose Duplicate to keep a “before” baseline.", target: "[aria-label^='Actions for']", point: "⋯ menu", check: (c) => c.cmd("project.duplicate"), waiting: "a duplicate", go: { path: "/dashboard/workspaces" } },
      { title: "Move a project", body: "⋯ → Move to… sends a project to another workspace. (You need at least two workspaces.)", target: "[aria-label^='Actions for']", check: (c) => c.cmd("project.move"), waiting: "a move", optional: true },
      { title: "Archive", body: "⋯ → Archive hides a project you aren't using without deleting it.", target: "[aria-label^='Actions for']", check: (c) => c.cmd("project.setStatus"), waiting: "an archive" },
      { title: "Find archived projects", body: "Switch the status filter to Archived.", target: "btn:Archived", check: () => /status=archived/.test(location.search), waiting: "the Archived filter" },
      { title: "Restore it", body: "⋯ → Restore brings it back to your active list.", target: "[aria-label^='Actions for']", check: (c) => c.cmd("project.setStatus"), waiting: "a restore", shout: { tone: "tip", text: "Archiving hides a project; deleting removes it permanently (you must type its name)." } },
      done("Lifecycle managed", "Keep baselines when documenting changes or remediation (ISO 27001 A.8.9 configuration baselines)."),
    ],
  },
  {
    id: "T16", practice: "office-lan", steps: [
      { title: "Share shows the last SAVED version", body: "Save the project first so the link shows your latest work.", target: "btn:Save project", check: (c) => !c.dirty && c.version > 0, waiting: "a saved project" },
      { title: "Open Share", body: "Click Share.", target: "btn:Share", point: "Share", check: (c) => c.exists("#sh-label"), waiting: "the Share dialog" },
      { title: "Label", body: "The label is only for you, e.g. “For clinic manager”.", target: "#sh-label", check: (c) => c.value("#sh-label").trim().length > 0, waiting: "a label" },
      { title: "Require a password", body: "Type a password of at least 6 characters. The strength meter helps.", target: "#sh-pw", point: "Password", check: (c) => c.value("#sh-pw").length >= 6, waiting: "a password (6+ characters)" },
      { title: "Expiry and contents", body: "Choose when the link expires and what to include. The security report is off by default because findings are sensitive.", target: "#sh-exp", shout: { tone: "warn", text: "Send the password separately from the link (e.g. by phone or a different app)." } },
      { title: "Create the link", body: "Click Create link, then Copy.", target: "btn:Create link", point: "Create link", check: (c) => c.cmd("share.create"), waiting: "a share link" },
      { title: "Turn links off", body: "Every link is listed under “Links for this project” with its view count. Turn a link off as soon as the review is over." },
      done("Shared safely", "Read-only, password-protected, expiring links support need-to-know sharing (HIPAA minimum necessary; RA 10173 proportionality)."),
    ],
  },
];
