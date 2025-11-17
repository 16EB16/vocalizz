# Cahier des Charges - Vocalizz AI Voice Model Creator

Ce document décrit les spécifications fonctionnelles et techniques de l'application web Vocalizz, un créateur de modèles de voix IA basé sur la technologie RVC (Retrieval-based Voice Conversion).

## 1. Architecture Technique

| Catégorie | Technologie / Outil | Détails |
| :--- | :--- | :--- |
| **Frontend** | React, TypeScript, Vite | Application monopage (SPA). |
| **Styling** | Tailwind CSS, shadcn/ui | Design system basé sur HSL, entièrement responsive. |
| **Routing** | React Router DOM | Gestion des routes côté client. |
| **Backend / BaaS** | Supabase | Base de données PostgreSQL, Authentification, Stockage (Storage), et Fonctions Edge (Edge Functions). |
| **Data Fetching** | TanStack Query | Gestion de l'état serveur, mise en cache et synchronisation. |
| **API Externe IA** | Replicate | Utilisation pour l'entraînement des modèles RVC (via Edge Functions). |
| **Paiement** | Stripe | Gestion des abonnements et portail de facturation. |
| **Validation** | React Hook Form, Zod | Gestion des formulaires et validation des schémas. |
| **Notifications** | Sonner (général), shadcn/ui Toast (critique) | Système de notification utilisateur. |

## 2. Modèle de Données (Supabase `public` schema)

| Table | Colonnes Clés | RLS | Description |
| :--- | :--- | :--- | :--- |
| `profiles` | `id` (FK: `auth.users`), `role`, `stripe_customer_id`, `first_name`, `last_name`, `is_in_training` | **Activé** (Accès limité à l'utilisateur via `auth.uid() = id`) | Stocke les métadonnées utilisateur et le statut d'abonnement. |
| `voice_models` | `id`, `user_id` (FK: `auth.users`), `name`, `quality`, `poch_value`, `status`, `external_job_id`, `score_qualite_source`, `cleaning_applied` | **Activé** (Accès limité à l'utilisateur via `auth.uid() = user_id`) | Stocke les informations sur les modèles vocaux créés. |

## 3. Fonctionnalités Clés (Frontend & UX)

### 3.1. Authentification et Accès

*   **Page d'Accueil (`/`)**: Présentation du produit, fonctionnalités clés, et CTA vers l'authentification.
*   **Page d'Authentification (`/auth`)**: Permet la connexion et l'inscription via email/mot de passe (Supabase Auth). L'inscription capture le prénom et le nom.
*   **Protection des Routes**: Les routes du tableau de bord (`/dashboard`, `/create`, `/settings`) sont protégées par `DashboardLayout`. Les utilisateurs non authentifiés sont redirigés vers `/auth`.
*   **Gestion de Session**: Utilisation de `supabase.auth.onAuthStateChange` pour gérer l'état de la session et invalider les requêtes TanStack Query (`userProfile`, `voiceModels`) lors des changements d'état.

### 3.2. Tableau de Bord (Studio - `/dashboard`)

*   **Affichage des Modèles**: Liste tous les modèles vocaux créés par l'utilisateur, triés par date de création.
*   **Statut en Temps Réel**: Affiche le statut (`processing`, `completed`, `failed`) et une barre de progression calculée en fonction du temps écoulé et de la valeur POCH estimée.
*   **Gestion des Modèles**:
    *   **Téléchargement**: Bouton de téléchargement pour les modèles `completed` (simule la génération de liens signés Supabase Storage).
    *   **Suppression**: Dialogue de confirmation pour supprimer définitivement le modèle de la DB et les fichiers source du Storage (via Edge Function `delete-model-files`).
    *   **Annulation**: Bouton d'annulation pour les modèles `processing` (via Edge Function `cancel-training`).
*   **Limites Utilisateur**: Affiche la limite de 5 modèles pour les utilisateurs `standard`.
*   **Abonnement**: Affichage du statut Premium et bouton d'accès au portail de facturation.

### 3.3. Création de Modèle (`/create`)

*   **Restriction d'Entraînement**: Un utilisateur ne peut lancer qu'un seul entraînement à la fois (`is_in_training` dans `profiles`).
*   **Upload Audio**:
    *   Supporte les fichiers MP3 et WAV.
    *   Fonctionnalité Drag & Drop.
    *   Validation de la taille totale (Max 120 MB) et de la durée minimale (Min 10 minutes).
    *   Calcul de la durée des fichiers côté client (`getAudioDuration`).
*   **Analyse Audio (Simulée)**: Affiche un score de qualité source basé sur la durée totale.
*   **Options d'Entraînement**:
    *   **Qualité POCH**: Choix entre Standard (500 POCH) et Premium (2000 POCH). L'option Premium est réservée aux utilisateurs Premium.
    *   **Nettoyage IA**: Option de nettoyage Premium (suppression du bruit) réservée aux utilisateurs Premium.
*   **Processus de Soumission (Transactionnel)**:
    1.  Mise à jour du statut `is_in_training` à `true`.
    2.  Upload des fichiers audio vers Supabase Storage (bucket `audio-files`, chemin `user_id/model_name_sanitized/`).
    3.  Création de l'entrée `voice_models` avec statut `preprocessing`.
    4.  Appel de l'Edge Function `trigger-ai-training`.
    5.  En cas d'échec à n'importe quelle étape, le statut `is_in_training` est réinitialisé à `false`, et le modèle est marqué `failed` (si créé).

### 3.4. Paramètres (`/settings`)

*   **Gestion de Profil**: Formulaire pour mettre à jour le `first_name` et `last_name` de la table `profiles`.
*   **Gestion de l'Abonnement**:
    *   Affiche le statut `Premium` ou `Gratuit`.
    *   Bouton `BillingPortalButton` qui redirige vers Stripe Checkout (pour Standard) ou Stripe Billing Portal (pour Premium) via les Edge Functions.
    *   Gestion des notifications de succès/annulation via les paramètres d'URL (`?success=true`, `?canceled=true`).

## 4. Edge Functions (Backend)

| Fonction | Rôle | Authentification | Privilèges |
| :--- | :--- | :--- | :--- |
| `create-checkout-session` | Crée une session de paiement Stripe pour l'abonnement Premium. Gère la création du `stripe_customer_id` si manquant. | JWT (Client) | Client (RLS) |
| `create-billing-portal-session` | Crée une session pour le portail de facturation Stripe. | JWT (Client) | Client (RLS) |
| `webhook-stripe` | Gère les événements Stripe (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`) pour mettre à jour le champ `role` et `stripe_customer_id` dans la table `profiles` (Service Role). | Aucun (Signature Stripe requise en prod) | Service Role (Admin) |
| `trigger-ai-training` | Lance l'entraînement RVC via l'API Replicate. Met à jour le statut du modèle à `processing` et enregistre l'`external_job_id`. Gère le nettoyage des fichiers source en cas d'échec. | JWT (Client) | Service Role (pour DB updates) |
| `webhook-ai-status` | Reçoit le statut de Replicate (`succeeded`/`failed`). Met à jour le statut du modèle à `completed`/`failed` et réinitialise `is_in_training` à `false`. **Supprime les fichiers source du Storage après la fin (succès ou échec)**. | Aucun (Webhook) | Service Role (Admin) |
| `delete-model-files` | Supprime les fichiers source d'un modèle du Storage. Utilisé lors de la suppression manuelle d'un modèle par l'utilisateur. | Service Role (Admin) | Service Role (Admin) |
| `cancel-training` | Annule manuellement un entraînement en cours. Met à jour le statut du modèle à `failed`, réinitialise `is_in_training`, et supprime les fichiers source. | JWT (Client) | Service Role (pour DB updates et Storage) |