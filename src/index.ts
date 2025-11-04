import { makeTownsBot, type BotHandler } from '@towns-protocol/bot'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { commands } from './commands'
import {
    activeGames,
    cleanupGame,
    GamePhase,
    generateCountdownMessage,
    generateFrame,
    generateResultMessage,
    generateTournamentResults,
    sendShotFeedback,
    updateFrame,
    calculateScore,
    UPDATE_INTERVAL,
    SINGLE_PLAYER_DURATION,
    TOURNAMENT_DURATION,
    COUNTDOWN_SECONDS,
    type MovingHoopGame,
} from './game'

console.log('Starting Towns bot...')
console.log('APP_PRIVATE_DATA exists:', !!process.env.APP_PRIVATE_DATA)
console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET)

const bot = await makeTownsBot(process.env.APP_PRIVATE_DATA!, process.env.JWT_SECRET!, {
    commands,
})

console.log('Bot initialized successfully')

// Start a new game (either single player or tournament)
async function startGame(handler: BotHandler, channelId: string, isTournament: boolean) {
    // Send countdown message
    const countdownMsg = await handler.sendMessage(channelId, generateCountdownMessage(COUNTDOWN_SECONDS))

    // Create game state
    const game: MovingHoopGame = {
        messageId: countdownMsg.eventId,
        channelId,
        phase: GamePhase.COUNTDOWN,
        startTime: Date.now(),
        frameCount: 0,
        isTournament,
        hoopPosition: 25,
        hoopDirection: 1,
        aimPosition: 15,
        aimDirection: 1,
        players: new Map(),
    }

    activeGames.set(countdownMsg.eventId, game)

    // Countdown phase
    let countdown = COUNTDOWN_SECONDS - 1
    const countdownInterval = setInterval(() => {
        void (async () => {
        if (countdown > 0) {
            try {
                await handler.editMessage(channelId, countdownMsg.eventId, generateCountdownMessage(countdown))
            } catch (error) {
                console.error('Failed to update countdown:', error)
                clearInterval(countdownInterval)
                cleanupGame(countdownMsg.eventId)
            }
            countdown--
        } else {
            clearInterval(countdownInterval)

            // Start aiming phase
            game.phase = GamePhase.AIMING
            game.startTime = Date.now()

            try {
                await handler.editMessage(channelId, countdownMsg.eventId, generateFrame(game))
            } catch (error) {
                console.error('Failed to start game:', error)
                cleanupGame(countdownMsg.eventId)
                return
            }

            // Start game loop
            const gameInterval = setInterval(() => {
                void (async () => {
                try {
                    // Check for timeout
                    const duration = Date.now() - game.startTime
                    const maxDuration = isTournament ? TOURNAMENT_DURATION : SINGLE_PLAYER_DURATION

                    if (duration >= maxDuration) {
                        // Game over
                        clearInterval(gameInterval)
                        game.phase = GamePhase.RESULT

                        // Show results
                        const resultMsg = isTournament
                            ? generateTournamentResults(game)
                            : generateResultMessage(game)

                        await handler.editMessage(channelId, countdownMsg.eventId, resultMsg)

                        // Cleanup after showing results
                        setTimeout(() => cleanupGame(countdownMsg.eventId), 60000)
                        return
                    }

                    // Update frame if still in aiming phase
                    if (game.phase === GamePhase.AIMING) {
                        await updateFrame(game, handler)
                    }
                } catch (error) {
                    console.error('Game loop error:', error)
                    clearInterval(gameInterval)
                    cleanupGame(countdownMsg.eventId)

                    // Notify users
                    try {
                        await handler.sendMessage(channelId, '⚠️ Game ended due to technical difficulties.')
                    } catch {
                        // Ignore if we can't send error message
                    }
                }
                })()
            }, UPDATE_INTERVAL)

            game.interval = gameInterval
        }
        })()
    }, 1000)
}

// Handle /hoopshot command (single player)
bot.onSlashCommand('hoopshot', async (handler, { channelId }) => {
    console.log('Received /hoopshot command in channel:', channelId)
    await startGame(handler, channelId, false)
})

// Handle /hooptourney command (tournament mode)
bot.onSlashCommand('hooptourney', async (handler, { channelId }) => {
    console.log('Received /hooptourney command in channel:', channelId)
    await startGame(handler, channelId, true)
})

// Handle reactions (basketball emoji)
bot.onReaction(async (handler, { messageId, userId, channelId, reaction }) => {
    // Only handle basketball emoji
    if (reaction !== '🏀') return

    const game = activeGames.get(messageId)
    if (!game) return

    // Only accept reactions during aiming phase
    if (game.phase !== GamePhase.AIMING) return

    // Check if player already shot
    if (game.players.has(userId)) {
        await handler.sendMessage(channelId, `<@${userId}> You already took your shot!`)
        return
    }

    // Capture positions
    const hoopPos = Math.round(game.hoopPosition)
    const aimPos = Math.round(game.aimPosition)
    const distance = Math.abs(hoopPos - aimPos)
    const score = calculateScore(distance)

    // Store player shot
    game.players.set(userId, {
        userId,
        hoopPos,
        aimPos,
        distance,
        score,
        shotTime: Date.now(),
    })

    // Send immediate feedback
    await sendShotFeedback(handler, channelId, userId, distance)

    // For single player mode, end game immediately after first shot
    if (!game.isTournament && game.players.size === 1) {
        // Stop the game loop
        if (game.interval) {
            clearInterval(game.interval)
        }

        game.phase = GamePhase.RESULT

        // Show results immediately
        const resultMsg = generateResultMessage(game)
        await handler.editMessage(channelId, messageId, resultMsg)

        // Cleanup after showing results
        setTimeout(() => cleanupGame(messageId), 60000)
    }
})

const { jwtMiddleware, handler } = bot.start()

const app = new Hono()
app.use(logger())
app.post('/webhook', jwtMiddleware, handler)

export default app
