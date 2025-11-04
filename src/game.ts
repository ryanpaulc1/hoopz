import type { BotHandler } from '@towns-protocol/bot'

// Game constants
export const UPDATE_INTERVAL = 100 // 100ms = 10 FPS
export const HOOP_SPEED = 0.8
export const AIM_SPEED = 1.3
export const MIN_POS = 5
export const MAX_POS = 45
export const WIDTH = 50
export const SINGLE_PLAYER_DURATION = 20000 // 20 seconds
export const TOURNAMENT_DURATION = 30000 // 30 seconds
export const SHOT_ANIMATION_FRAMES = 15
export const COUNTDOWN_SECONDS = 3

// Game phases
export enum GamePhase {
    INTRO = 'intro',
    COUNTDOWN = 'countdown',
    AIMING = 'aiming',
    SHOOTING = 'shooting',
    RESULT = 'result',
}

// Player shot data
export interface PlayerShot {
    userId: string
    hoopPos: number
    aimPos: number
    distance: number
    score: number
    shotTime: number
}

// Shot data for animation
export interface ShotData {
    hoopPos: number
    aimPos: number
    distance: number
    score: number
    animationFrame: number
}

// Main game state
export interface MovingHoopGame {
    messageId: string
    channelId: string
    phase: GamePhase
    startTime: number
    frameCount: number
    isTournament: boolean

    // Positions (0-49 range)
    hoopPosition: number
    hoopDirection: 1 | -1
    aimPosition: number
    aimDirection: 1 | -1

    // Shot data (captured when player shoots)
    shotData?: ShotData

    // Players (for tournament mode)
    players: Map<string, PlayerShot>
    interval?: NodeJS.Timeout
}

// Active games storage
export const activeGames = new Map<string, MovingHoopGame>()

// Calculate score based on distance
export function calculateScore(distance: number): number {
    if (distance === 0) return 100
    if (distance <= 2) return 50
    if (distance <= 5) return 10
    return 0
}

// Get result message based on distance
export function getResultMessage(distance: number): string {
    if (distance === 0) return '🏆 PERFECT! Nothing but net!'
    if (distance <= 2) return '✅ GREAT SHOT! It went in!'
    if (distance <= 5) return '😅 CLOSE! Rim out!'
    return '❌ MISSED! Way off!'
}

// Generate countdown message
export function generateCountdownMessage(count: number): string {
    return `🏀 **MOVING HOOP CHALLENGE**
═══════════════════════════════════════════════════

The hoop 🏀 and your aim ▲ are both moving!
React with 🏀 when they align perfectly!

Starting in ${count}...`
}

// Draw hoop at position
function drawHoopAtPosition(line: string[], x: number, y: number): void {
    // Backboard structure (13 chars wide, centered at x)
    const backboardLeft = x - 6
    const backboardRight = x + 6

    if (y === 3) {
        // Top of backboard
        if (x >= 6 && x <= WIDTH - 7) {
            for (let i = backboardLeft; i <= backboardRight; i++) {
                if (i >= 0 && i < WIDTH) {
                    if (i === backboardLeft) line[i] = '╔'
                    else if (i === backboardRight) line[i] = '╗'
                    else line[i] = '═'
                }
            }
        }
    } else if (y >= 4 && y <= 7) {
        // Backboard sides and fill
        if (x >= 6 && x <= WIDTH - 7) {
            for (let i = backboardLeft; i <= backboardRight; i++) {
                if (i >= 0 && i < WIDTH) {
                    if (i === backboardLeft || i === backboardRight) line[i] = '║'
                    else line[i] = '▓'
                }
            }
        }

        // Target square (3x3) in center of backboard
        if (y >= 5 && y <= 7) {
            const targetLeft = x - 1
            const targetRight = x + 1
            if (y === 5) {
                // Top of target
                for (let i = targetLeft; i <= targetRight; i++) {
                    if (i >= 0 && i < WIDTH) {
                        if (i === targetLeft) line[i] = '╔'
                        else if (i === targetRight) line[i] = '╗'
                        else line[i] = '═'
                    }
                }
            } else if (y === 6) {
                // Middle of target
                if (targetLeft >= 0 && targetLeft < WIDTH) line[targetLeft] = '║'
                if (targetRight >= 0 && targetRight < WIDTH) line[targetRight] = '║'
                // Empty space in middle
                if (x >= 0 && x < WIDTH) line[x] = ' '
            } else if (y === 7) {
                // Bottom of target
                for (let i = targetLeft; i <= targetRight; i++) {
                    if (i >= 0 && i < WIDTH) {
                        if (i === targetLeft) line[i] = '╚'
                        else if (i === targetRight) line[i] = '╝'
                        else line[i] = '═'
                    }
                }
            }
        }
    } else if (y === 8) {
        // Bottom of backboard
        if (x >= 6 && x <= WIDTH - 7) {
            for (let i = backboardLeft; i <= backboardRight; i++) {
                if (i >= 0 && i < WIDTH) {
                    if (i === backboardLeft) line[i] = '╚'
                    else if (i === backboardRight) line[i] = '╝'
                    else if (i === x) line[i] = '╤'
                    else line[i] = '═'
                }
            }
        }
    } else if (y === 9) {
        // Mounting bracket
        if (x >= 0 && x < WIDTH) line[x] = '│'
    } else if (y === 10) {
        // Rim
        if (x >= 0 && x < WIDTH) line[x] = '○'
    } else if (y === 11) {
        // Rim base
        const rimLeft = x - 1
        const rimRight = x + 1
        for (let i = rimLeft; i <= rimRight; i++) {
            if (i >= 0 && i < WIDTH) {
                if (i === rimLeft || i === rimRight) line[i] = '═'
                else line[i] = '═'
            }
        }
    } else if (y === 12) {
        // Net top
        const netLeft = x - 2
        const netRight = x + 2
        for (let i = netLeft; i <= netRight; i++) {
            if (i >= 0 && i < WIDTH) {
                if (i === netLeft) line[i] = '\\'
                else if (i === netRight) line[i] = '/'
                else line[i] = '│'
            }
        }
    } else if (y === 13) {
        // Net middle
        const netLeft = x - 1
        const netRight = x + 1
        for (let i = netLeft; i <= netRight; i++) {
            if (i >= 0 && i < WIDTH) {
                if (i === netLeft) line[i] = '\\'
                else if (i === netRight) line[i] = '/'
                else line[i] = '│'
            }
        }
    } else if (y === 14) {
        // Net bottom
        if (x >= 0 && x < WIDTH) line[x] = 'V'
    }
}

// Generate game frame
export function generateFrame(game: MovingHoopGame): string {
    const lines: string[] = []

    // Header
    lines.push('🏀 **MOVING HOOP CHALLENGE**')
    lines.push('```')
    lines.push('═'.repeat(WIDTH))

    // Draw court (20 lines)
    for (let y = 0; y < 20; y++) {
        const line = ' '.repeat(WIDTH).split('')

        // Draw backboard and hoop at hoopPosition
        const hoopX = Math.round(game.hoopPosition)
        if (y >= 3 && y <= 14) {
            drawHoopAtPosition(line, hoopX, y)
        }

        // Draw aim indicator
        const aimX = Math.round(game.aimPosition)
        if (y === 15) {
            if (aimX >= 0 && aimX < WIDTH) line[aimX] = '▲'
        } else if (y === 16) {
            if (aimX >= 0 && aimX < WIDTH) line[aimX] = '│'
        }

        // Player (always at center)
        if (y === 17) {
            line[25] = '🧍'
        }

        // Free throw line
        if (y === 18) {
            for (let x = 15; x <= 35; x++) {
                if (x >= 0 && x < WIDTH) line[x] = '─'
            }
        }

        lines.push(line.join(''))
    }

    lines.push('═'.repeat(WIDTH))
    lines.push('```')

    // Position indicators
    const hoopBar = '░'.repeat(WIDTH).split('')
    hoopBar[Math.round(game.hoopPosition)] = '█'
    lines.push('HOOP:  [' + hoopBar.join('') + ']')

    const aimBar = '░'.repeat(WIDTH).split('')
    aimBar[Math.round(game.aimPosition)] = '▲'
    lines.push('AIM:   [' + aimBar.join('') + ']')

    // Alignment status
    const distance = Math.abs(Math.round(game.hoopPosition) - Math.round(game.aimPosition))
    lines.push('')
    if (distance === 0) {
        lines.push('🔥 **PERFECT ZONE! React with 🏀 NOW!** 🔥')
    } else if (distance <= 2) {
        lines.push('🎯 **VERY CLOSE!** Almost perfect! 🎯')
    } else if (distance <= 5) {
        lines.push('⚠️ Getting closer...')
    } else {
        lines.push('⏱️ Wait for alignment...')
    }

    return lines.join('\n')
}

// Generate result message for single player
export function generateResultMessage(game: MovingHoopGame): string {
    const player = Array.from(game.players.values())[0]
    if (!player) {
        return `🏀 **GAME OVER**

No shots taken! The game has ended.

Time to try again? Use /hoopshot to play!`
    }

    const resultMsg = getResultMessage(player.distance)
    const duration = ((Date.now() - game.startTime) / 1000).toFixed(1)

    return `🏀 **GAME OVER**

${resultMsg}

📊 **Final Stats:**
• Distance: ${player.distance} positions
• Score: ${player.score} points
• Reaction time: ${duration}s

${player.score >= 50 ? '🏆 Excellent shooting!' : player.score > 0 ? '💪 Keep practicing!' : '😅 Better luck next time!'}`
}

// Generate tournament results
export function generateTournamentResults(game: MovingHoopGame): string {
    const lines: string[] = []
    lines.push('🏀 **TOURNAMENT RESULTS**')
    lines.push('═'.repeat(WIDTH))
    lines.push('')

    // Sort players by score (desc), then by distance (asc), then by shot time (asc)
    const sortedPlayers = Array.from(game.players.values()).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        if (a.distance !== b.distance) return a.distance - b.distance
        return a.shotTime - b.shotTime
    })

    if (sortedPlayers.length === 0) {
        lines.push('No shots taken! The tournament has ended.')
        lines.push('')
        lines.push('Try again with /hooptourney!')
        return lines.join('\n')
    }

    // Display top 3 with medals, rest with 👏
    sortedPlayers.forEach((player, index) => {
        let medal = ''
        if (index === 0) medal = '🥇'
        else if (index === 1) medal = '🥈'
        else if (index === 2) medal = '🥉'
        else medal = '👏'

        const resultMsg =
            player.distance === 0
                ? 'PERFECT!'
                : player.distance <= 2
                  ? 'SCORED!'
                  : player.distance <= 5
                    ? 'CLOSE!'
                    : 'MISSED!'

        lines.push(`${medal} <@${player.userId}> - ${resultMsg} Distance: ${player.distance} (${player.score} pts)`)
    })

    lines.push('')

    // Stats
    const scored = sortedPlayers.filter((p) => p.distance <= 2).length
    const perfect = sortedPlayers.filter((p) => p.distance === 0).length
    const duration = ((Date.now() - game.startTime) / 1000).toFixed(1)

    lines.push(`📊 Stats: ${scored}/${sortedPlayers.length} scored | ${perfect} perfect shot${perfect !== 1 ? 's' : ''}`)
    lines.push(`⏱️ Game duration: ${duration} seconds`)
    lines.push('')

    // Champion
    const champion = sortedPlayers[0]
    lines.push(`🏆 Champion: <@${champion.userId}> 🏆`)

    return lines.join('\n')
}

// Update game frame
export async function updateFrame(game: MovingHoopGame, handler: BotHandler): Promise<void> {
    try {
        // Update positions
        game.hoopPosition += game.hoopDirection * HOOP_SPEED
        game.aimPosition += game.aimDirection * AIM_SPEED

        // Boundary bounce for hoop
        if (game.hoopPosition <= MIN_POS || game.hoopPosition >= MAX_POS) {
            game.hoopDirection *= -1
            game.hoopPosition = Math.max(MIN_POS, Math.min(MAX_POS, game.hoopPosition))
        }

        // Boundary bounce for aim
        if (game.aimPosition <= MIN_POS || game.aimPosition >= MAX_POS) {
            game.aimDirection *= -1
            game.aimPosition = Math.max(MIN_POS, Math.min(MAX_POS, game.aimPosition))
        }

        game.frameCount++

        // Edit message with new frame
        await handler.editMessage(game.channelId, game.messageId, generateFrame(game))
    } catch (error) {
        console.error('Failed to update frame:', error)
        cleanupGame(game.messageId)
        throw error
    }
}

// Cleanup game
export function cleanupGame(messageId: string): void {
    const game = activeGames.get(messageId)
    if (game) {
        if (game.interval) clearInterval(game.interval)
        activeGames.delete(messageId)
    }
}

// Send immediate feedback on shot
export async function sendShotFeedback(
    handler: BotHandler,
    channelId: string,
    userId: string,
    distance: number,
): Promise<void> {
    let message = ''
    if (distance === 0) {
        message = `🎯 PERFECT timing <@${userId}>!`
    } else if (distance <= 2) {
        message = `✅ Great timing <@${userId}>!`
    } else if (distance <= 5) {
        message = `👍 Good attempt <@${userId}>!`
    } else {
        message = `💪 Shot taken <@${userId}>!`
    }
    await handler.sendMessage(channelId, message)
}
