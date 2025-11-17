import React, { useMemo } from "react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { Home, PlusCircle, Settings, LogOut, Crown, User, Loader2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserStatus } from "@/hooks/use-user-status";
import { useUserProfile } from "@/hooks/use-user-profile"; // Import useUserProfile
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

const LOGO_URL = "https://i.ibb.co/Q7169P5W/Logo-Vocalizz.png";

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  isPremium?: boolean;
}

const NavItem = ({ to, icon, label, isPremium = false }: NavItemProps) => {
  const { isPremium: userIsPremium } = useUserStatus();
  const isDisabled = isPremium && !userIsPremium;

  return (
    <Tooltip delayDuration={100}>
      <TooltipTrigger asChild>
        <NavLink
          to={to}
          className={cn(
            "flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted rounded-md",
            isDisabled && "opacity-50 cursor-not-allowed pointer-events-none"
          )}
          activeClassName="bg-primary text-primary-foreground hover:bg-primary/90"
          end
        >
          {icon}
          <span className="hidden sm:inline">{label}</span>
          {isPremium && !userIsPremium && <Crown className="w-3 h-3 ml-1 text-yellow-500 fill-yellow-500/20" />}
        </NavLink>
      </TooltipTrigger>
      {isDisabled && (
        <TooltipContent>
          Fonctionnalité Premium
        </TooltipContent>
      )}
    </Tooltip>
  );
};

interface HeaderProps {
  onSignOut: () => void;
}

export const Header = ({ onSignOut }: HeaderProps) => {
  const { isPremium, userId, isLoading: isStatusLoading, credits, role } = useUserStatus();
  const { data: profile, isLoading: isProfileLoading } = useUserProfile(userId);

  const isLoading = isStatusLoading || isProfileLoading;

  const userName = useMemo(() => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    // Fallback to a generic name if profile is loading or incomplete
    return "Utilisateur";
  }, [profile]);

  if (isLoading) {
    // Render a minimal header while loading user status
    return (
      <header className="sticky top-0 z-30 w-full border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <img src={LOGO_URL} alt="Vocalizz Logo" className="h-8 w-auto" />
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <NavLink to="/dashboard" className="flex items-center gap-2 font-semibold">
          <img src={LOGO_URL} alt="Vocalizz Logo" className="h-8 w-auto" />
          <span className="sr-only">Vocalizz</span>
        </NavLink>
        
        <nav className="flex items-center gap-2">
          <NavItem to="/dashboard" icon={<Home className="h-4 w-4" />} label="Dashboard" />
          <NavItem to="/create" icon={<PlusCircle className="h-4 w-4" />} label="Créer Modèle" />
          <NavItem to="/settings" icon={<Settings className="h-4 w-4" />} label="Paramètres" />
        </nav>

        <div className="flex items-center gap-3">
          {/* Credit Display */}
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-muted text-sm font-medium cursor-default">
                <DollarSign className="w-4 h-4 text-primary" />
                <span>{credits}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Solde de Crédits
            </TooltipContent>
          </Tooltip>

          {userName && (
            <div className="hidden sm:flex items-center gap-1 text-sm font-medium text-foreground/80">
              <User className="w-4 h-4 text-primary" />
              <span className="truncate max-w-[150px]">{userName}</span>
            </div>
          )}
          {role !== 'free' && (
            <Badge className="bg-yellow-500 hover:bg-yellow-500/90 text-white gap-1">
              <Crown className="w-3 h-3 fill-white/30" />
              {role === 'pro' ? 'Pro' : 'Studio'}
            </Badge>
          )}
          <Button variant="ghost" size="icon" onClick={onSignOut} title="Déconnexion">
            <LogOut className="h-5 w-5" />
            <span className="sr-only">Déconnexion</span>
          </Button>
        </div>
      </div>
    </header>
  );
};