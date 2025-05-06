import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type AuthContextType = {
  session: Session | null;
  user: (User & { username?: string; role?: string }) | null;
  signIn: (email: string, password: string) => Promise<{ error: any | null }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: any | null }>;
  signOut: () => Promise<void>;
  updateProfile: (data: { username: string }) => Promise<void>;
  loading: boolean;
  isAdmin: boolean;
  isVip: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<(User & { username?: string; role?: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('user');

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // Fetch user profile
          if (newSession?.user) {
            setTimeout(() => {
              fetchUserProfile(newSession.user.id);
            }, 0);
          }
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      
      if (currentSession?.user) {
        fetchUserProfile(currentSession.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, username')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching user profile:', error);
      } else if (data) {
        setUserRole(data.role);
        // Extend the user object with profile data
        setUser(prev => prev ? { ...prev, role: data.role, username: data.username } : null);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        toast({
          title: "Login Failed",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }
      
      toast({
        title: "Login Successful",
        description: "Welcome back!",
      });
      
      return { error: null };
    } catch (error: any) {
      toast({
        title: "Login Error",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
      return { error };
    }
  };

  const signUp = async (email: string, password: string, username: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
          },
        },
      });
      
      if (error) {
        toast({
          title: "Registration Failed",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }
      
      toast({
        title: "Registration Successful",
        description: "Your account has been created.",
      });
      
      return { error: null };
    } catch (error: any) {
      toast({
        title: "Registration Error",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
      return { error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out.",
    });
  };

  // Add the updateProfile function
  const updateProfile = async (data: { username: string }) => {
    if (!user) throw new Error("No user logged in");
    
    try {
      // First update the profile in the database
      const { error } = await supabase
        .from('profiles')
        .update({ username: data.username })
        .eq('id', user.id);
        
      if (error) throw error;
      
      // Update the user metadata in auth
      const { error: updateError } = await supabase.auth.updateUser({
        data: { username: data.username }
      });
      
      if (updateError) throw updateError;
      
      // Update the local user state
      setUser(prev => prev ? { ...prev, username: data.username } : null);
      
    } catch (error: any) {
      console.error('Error updating profile:', error);
      throw error;
    }
  };

  const isAdmin = userRole === 'admin';
  const isVip = userRole === 'vip' || userRole === 'admin';

  const value = {
    session,
    user,
    signIn,
    signUp,
    signOut,
    updateProfile,
    loading,
    isAdmin,
    isVip,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
