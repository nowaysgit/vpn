import { createApp } from './app'

const port = Number(process.env.PORT ?? 3001)
const { app } = await createApp()

app.listen(port)

console.log(`vpn backend listening on http://0.0.0.0:${port}`)
