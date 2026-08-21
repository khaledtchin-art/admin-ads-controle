# ADS Admin Hub

Créer un espace Admin sécurisé pour mon application ADS.



Créer un dashboard réservé uniquement à mon compte administrateur.



Fonctionnalités :

- authentification admin séparée ;

- vérification du rôle super_admin depuis Supabase ;

- aucun utilisateur normal ne doit pouvoir accéder à l'espace admin ;

- dashboard statistiques ADS ;

- gestion utilisateurs ;

- validation KYC ;

- gestion dépôts et retraits ;

- suivi transactions ;

- gestion marketplace ADS Store ;

- gestion parrainage ;

- logs de sécurité des actions admin.



Sécuriser avec Supabase RLS et empêcher toute modification non autorisée des données financières.

Créer une page /admin pour ADS.



La page doit être accessible uniquement aux utilisateurs dont le user_id existe dans la table admins Supabase avec le rôle super_admin.



Si l'utilisateur n'est pas admin, afficher accès refusé.



Créer un dashboard avec :

- utilisateurs

- wallets

- transactions

- retraits

- KYC

- marketplace

- statistiques.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://admin-ads-controle.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5e2f9f59-eae6-4666-8c44-3b59bfbd886f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
