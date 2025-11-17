CREATE OR REPLACE FUNCTION public.deduct_credits_and_create_model(
    p_user_id UUID,
    p_cost_in_credits INTEGER,
    p_model_name TEXT,
    p_quality TEXT,
    p_poch_value INTEGER,
    p_file_count INTEGER,
    p_audio_duration_seconds INTEGER,
    p_score_qualite_source INTEGER,
    p_cleaning_applied BOOLEAN,
    p_is_premium_model BOOLEAN
)
RETURNS UUID
LANGUAGE PLPGSQL
SECURITY DEFINER
AS $$
DECLARE
    current_credits INTEGER;
    current_role user_role;
    active_trainings_count INTEGER;
    max_trainings INTEGER;
    model_id UUID;
BEGIN
    -- 1. Récupérer le profil et verrouiller la ligne
    SELECT credits, role, active_trainings INTO current_credits, current_role, active_trainings_count
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF current_credits IS NULL THEN
        RAISE EXCEPTION 'Profile not found for user %', p_user_id;
    END IF;

    -- Définir la limite maximale d'entraînements simultanés
    CASE current_role
        WHEN 'studio' THEN max_trainings := 3;
        ELSE max_trainings := 1;
    END CASE;

    -- 2. Vérification des limites
    IF active_trainings_count >= max_trainings THEN
        RAISE EXCEPTION 'Training limit reached. Max active trainings: %', max_trainings;
    END IF;

    -- 3. Vérification des crédits
    IF current_credits < p_cost_in_credits THEN
        RAISE EXCEPTION 'Insufficient credits. Required: %, Available: %', p_cost_in_credits, current_credits;
    END IF;

    -- 4. Déduire les crédits et incrémenter le compteur d'entraînement
    UPDATE public.profiles
    SET 
        credits = credits - p_cost_in_credits,
        active_trainings = active_trainings + 1
    WHERE id = p_user_id;

    -- 5. Créer l'entrée du modèle
    INSERT INTO public.voice_models (
        user_id, 
        name, 
        quality, 
        poch_value, 
        status, 
        file_count, 
        audio_duration_seconds, 
        score_qualite_source, 
        cleaning_applied,
        is_premium_model,
        cost_in_credits -- Enregistrer le coût
    )
    VALUES (
        p_user_id,
        p_model_name,
        p_quality,
        p_poch_value,
        'preprocessing',
        p_file_count,
        p_audio_duration_seconds,
        p_score_qualite_source,
        p_cleaning_applied,
        p_is_premium_model,
        p_cost_in_credits
    )
    RETURNING id INTO model_id;

    RETURN model_id;

END;
$$;