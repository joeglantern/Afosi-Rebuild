import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Briefcase, Image, Menu, X, LogOut, Newspaper, FolderKanban, Inbox } from "lucide-react";
import OpportunitiesAdminPanel from "./components/OpportunitiesAdminPanel";
import GalleryAdminPanel from "./components/GalleryAdminPanel";
import NewsAdminPanel from "./components/NewsAdminPanel";
import ProjectsAdminPanel from "./components/ProjectsAdminPanel";
import ApplicationsAdminPanel from "./components/ApplicationsAdminPanel";
import Login from "./components/Login";
import { ThemeToggle } from "./components/ThemeToggle";

type TabType = "opportunities" | "applications" | "gallery" | "news" | "projects";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("opportunities");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Check if user is already logged in (from localStorage)
  useEffect(() => {
    const authStatus = localStorage.getItem("afosi_admin_auth");
    if (authStatus === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem("afosi_admin_auth");
    localStorage.removeItem("afosi_admin_token");
  };

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const tabs = [
    { id: "opportunities" as TabType, label: "Opportunities", icon: Briefcase },
    { id: "applications" as TabType, label: "Applications", icon: Inbox },
    { id: "gallery" as TabType, label: "Gallery", icon: Image },
    { id: "news" as TabType, label: "News", icon: Newspaper },
    { id: "projects" as TabType, label: "Projects", icon: FolderKanban },
  ];

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
                <p className="text-xs text-background/60">Admin Panel</p>
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
                    activeTab === tab.id
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

          {/* Logout Button */}
          <div className="p-4 border-t border-background/10">
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
                  {tabs.find((t) => t.id === activeTab)?.label} Management
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage your {activeTab} content
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
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === "opportunities" && <OpportunitiesAdminPanel />}
            {activeTab === "applications" && <ApplicationsAdminPanel />}
            {activeTab === "gallery" && <GalleryAdminPanel />}
            {activeTab === "news" && <NewsAdminPanel />}
            {activeTab === "projects" && <ProjectsAdminPanel />}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

export default App;
