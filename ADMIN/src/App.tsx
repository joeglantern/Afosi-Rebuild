import { useState } from "react";
import { motion } from "framer-motion";
import { Briefcase, Image, Menu, X, LogOut, Newspaper, FolderKanban, Inbox, PenLine, Users, KeyRound } from "lucide-react";
import OpportunitiesAdminPanel from "./components/OpportunitiesAdminPanel";
import GalleryAdminPanel from "./components/GalleryAdminPanel";
import NewsAdminPanel from "./components/NewsAdminPanel";
import ProjectsAdminPanel from "./components/ProjectsAdminPanel";
import ApplicationsAdminPanel from "./components/ApplicationsAdminPanel";
import BlogAdminPanel from "./components/BlogAdminPanel";
import BlogTeamPanel from "./components/BlogTeamPanel";
import ChangePasswordDialog from "./components/ChangePasswordDialog";
import Login from "./components/Login";
import { ThemeToggle } from "./components/ThemeToggle";
import { authClient, clearServiceToken, ROLE_LABELS } from "./lib/auth-client";

type TabType = "opportunities" | "applications" | "gallery" | "news" | "blog" | "projects" | "team";

// Who sees what. The server enforces the same split (cms-server/src/http.js):
// a blog editor's session is refused by every other part of the API.
const TABS: { id: TabType; label: string; title: string; subtitle: string; icon: typeof Briefcase; adminOnly: boolean }[] = [
  { id: "opportunities", label: "Opportunities", title: "Opportunities Management", subtitle: "Manage your opportunities content", icon: Briefcase, adminOnly: true },
  { id: "applications", label: "Applications", title: "Applications Management", subtitle: "Manage your applications content", icon: Inbox, adminOnly: true },
  { id: "gallery", label: "Gallery", title: "Gallery Management", subtitle: "Manage your gallery content", icon: Image, adminOnly: true },
  { id: "news", label: "News", title: "News Management", subtitle: "Manage your news content", icon: Newspaper, adminOnly: true },
  { id: "blog", label: "Blog", title: "Blog", subtitle: "Write, schedule and publish stories", icon: PenLine, adminOnly: false },
  { id: "projects", label: "Projects", title: "Projects Management", subtitle: "Manage your projects content", icon: FolderKanban, adminOnly: true },
  { id: "team", label: "Blog team", title: "Blog Team", subtitle: "Logins for blog editors and admins", icon: Users, adminOnly: true },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabType>("opportunities");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [changingPassword, setChangingPassword] = useState(false);

  // The session comes from the server (a httpOnly cookie), not from a flag in
  // localStorage, so an expired or revoked session really logs you out.
  const { data: session, isPending, refetch } = authClient.useSession();

  const handleLogin = () => {
    refetch();
  };

  const handleLogout = async () => {
    clearServiceToken();
    await authClient.signOut();
    refetch();
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Show login page if not authenticated
  if (!session) {
    return <Login onLogin={handleLogin} />;
  }

  const role = session.user.role;
  const isAdmin = role === "admin";
  const isEditor = role === "editor";

  // Signed in, but neither an admin nor a blog editor: the API would refuse
  // every change anyway.
  if (!isAdmin && !isEditor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center space-y-4">
          <p className="text-foreground font-semibold">This account does not have admin access.</p>
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const tabs = TABS.filter((t) => isAdmin || !t.adminOnly);
  // A blog editor lands on the Blog; nobody can sit on a tab they lack.
  const current = tabs.find((t) => t.id === activeTab) ?? tabs.find((t) => t.id === "blog") ?? tabs[0];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-foreground text-background transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-background/10">
            <div className="flex items-center gap-3">
              <img src="/afosi_logo_white.png" alt="AFOSI" className="h-10 w-auto" />
              <div>
                <h2 className="font-heading font-bold text-lg">AFOSI</h2>
                <p className="text-xs text-background/60">{isAdmin ? "Admin Panel" : "Blog Editor"}</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    current.id === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "text-background/70 hover:bg-background/10 hover:text-background"
                  }`}
                >
                  <Icon size={20} />
                  <span className="font-semibold">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Account + logout */}
          <div className="p-4 border-t border-background/10 space-y-1">
            <div className="px-4 pb-2">
              <p className="text-sm font-semibold truncate">{session.user.name}</p>
              <p className="text-xs text-background/60 truncate">
                {ROLE_LABELS[isAdmin ? "admin" : "editor"]} · {session.user.email}
              </p>
            </div>
            <button
              onClick={() => setChangingPassword(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-background/70 hover:bg-background/10 hover:text-background transition-colors"
            >
              <KeyRound size={20} />
              <span className="font-semibold">Change password</span>
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-background/70 hover:bg-red-500/20 hover:text-red-300 transition-colors"
            >
              <LogOut size={20} />
              <span className="font-semibold">Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top Bar */}
        <header className="bg-card border-b border-border px-4 py-4 lg:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden w-10 h-10 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
              >
                {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <div>
                <h1 className="text-2xl font-heading font-bold text-foreground">
                  {current.title}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {current.subtitle}
                </p>
              </div>
            </div>
            
            {/* Theme Toggle - Far Right */}
            <div className="flex items-center">
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {current.id === "opportunities" && <OpportunitiesAdminPanel />}
            {current.id === "applications" && <ApplicationsAdminPanel />}
            {current.id === "gallery" && <GalleryAdminPanel />}
            {current.id === "news" && <NewsAdminPanel />}
            {current.id === "blog" && <BlogAdminPanel />}
            {current.id === "projects" && <ProjectsAdminPanel />}
            {current.id === "team" && <BlogTeamPanel />}
          </motion.div>
        </main>
      </div>

      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
    </div>
  );
}

export default App;
