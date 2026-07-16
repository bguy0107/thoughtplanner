import { betterAuth, APIError } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './prisma.js'

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,       // refresh if older than 1 day
  },
  user: {
    additionalFields: {
      // Without this, better-auth strips the Prisma `role` column from
      // session.user since it isn't part of its core user schema — role
      // checks on the API would silently see `undefined` for everyone.
      role: {
        type: 'string',
        required: false,
        defaultValue: 'EDITOR',
        input: false, // never settable from signup/update-user requests
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // The workspace has no invite flow: gate self-service sign-up behind
        // ALLOW_SIGNUP so a random visitor can't create an account and get
        // full EDITOR access to every page. The very first account (workspace
        // owner) is always allowed through and promoted to ADMIN.
        async before(user) {
          const existingUsers = await prisma.user.count()

          if (existingUsers > 0 && process.env.ALLOW_SIGNUP !== 'true') {
            throw new APIError('FORBIDDEN', {
              message: 'Public sign-up is disabled. Ask a workspace admin to invite you.',
            })
          }

          return { data: { ...user, role: existingUsers === 0 ? 'ADMIN' : 'EDITOR' } }
        },
      },
    },
  },
  trustedOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
})

export type Auth = typeof auth
