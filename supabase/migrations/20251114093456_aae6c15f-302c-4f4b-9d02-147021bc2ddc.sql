-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Create voice_models table
CREATE TABLE public.voice_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quality TEXT NOT NULL CHECK (quality IN ('basic', 'standard', 'high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  audio_duration_seconds INTEGER,
  file_count INTEGER DEFAULT 0,
  model_url TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.voice_models ENABLE ROW LEVEL SECURITY;

-- Voice models policies
CREATE POLICY "Users can view their own models"
  ON public.voice_models FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own models"
  ON public.voice_models FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own models"
  ON public.voice_models FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own models"
  ON public.voice_models FOR DELETE
  USING (auth.uid() = user_id);

-- Create audio_files table
CREATE TABLE public.audio_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES public.voice_models(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  duration_seconds INTEGER,
  is_valid BOOLEAN DEFAULT TRUE,
  validation_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.audio_files ENABLE ROW LEVEL SECURITY;

-- Audio files policies
CREATE POLICY "Users can view files for their models"
  ON public.audio_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.voice_models
      WHERE voice_models.id = audio_files.model_id
      AND voice_models.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert files for their models"
  ON public.audio_files FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.voice_models
      WHERE voice_models.id = audio_files.model_id
      AND voice_models.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete files for their models"
  ON public.audio_files FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.voice_models
      WHERE voice_models.id = audio_files.model_id
      AND voice_models.user_id = auth.uid()
    )
  );

-- Trigger for profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger for updated_at on voice_models
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_voice_model_updated
  BEFORE UPDATE ON public.voice_models
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();