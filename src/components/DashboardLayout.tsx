import React, { useState, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Header } from "./Header";

const DashboardLayout = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initial check and setup listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const userIsAuthenticated = !!session;
      
      if (userIsAuthenticated) {
        setIsAuthenticated(true);
        // If we were loading and now signed in, stop loading
        if (isLoading) setIsLoading(false); 
      } else {
        setIsAuthenticated(false);
        // Only redirect if we are done loading (to prevent flash of unauthenticated content)
        if (!isLoading) {
          navigate("/auth");
        } else {
          // If initial session is null, stop loading and redirect
          setIsLoading(false);
          navigate("/auth");
        }
      }
    });

    // Check initial session state immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        navigate("/auth");
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // The listener handles navigation to /auth
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-foreground ml-2">Chargement de l'application...</p>
      </div>
    );
  }
  
  // If not authenticated after loading, this component shouldn't render, 
  // as the useEffect hook should have navigated away.
  if (!isAuthenticated) {
    return null; 
  }

  return (
    <div className="flex flex-col min-h-screen w-full">
      {/* Desktop/Mobile Header */}
      <Header onSignOut={handleSignOut} />
      
      <main className="flex-1 container mx-auto p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;