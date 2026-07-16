import { betterAuth } from 'better-auth'
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
  trustedOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
})

export type Auth = typeof auth
