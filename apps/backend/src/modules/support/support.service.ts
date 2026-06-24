import { db } from '../../db'
import { supportTickets } from '../../db/schema'
import { createId } from '../../lib/id'
import { now } from '../../lib/time'

type CreateSupportTicketInput = {
  subject: string
  message: string
}

export async function createSupportTicket(userId: string, input: CreateSupportTicketInput) {
  const ticket = {
    id: createId('ticket'),
    userId,
    subject: input.subject,
    message: input.message,
    status: 'open' as const,
    createdAt: now()
  }
  await db.insert(supportTickets).values(ticket)
  return ticket
}
