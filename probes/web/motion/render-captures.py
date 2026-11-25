"""Render the review GIFs and storyboard stills from actual Chrome captures."""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CAPTURES = Path(__file__).resolve().parents[3] / 'work/e7-motion/captures'
CHECKS = json.loads((CAPTURES / 'checks.json').read_text())
BACKGROUND = '#091725'
FOREGROUND = '#e7f3f8'
ACCENT = '#72e0e4'


def open_frame(path):
    with Image.open(CAPTURES / path) as frame:
        return frame.convert('RGB')


def text(draw, position, string, size, fill):
    draw.text(position, string, font=ImageFont.load_default(size), fill=fill)


def caption(image, title):
    card = Image.new('RGB', (image.width, image.height + 42), BACKGROUND)
    card.paste(image, (0, 42))
    text(ImageDraw.Draw(card), (12, 9), title, 18, ACCENT)
    return card


def phone_strip(items, width=300):
    height = round(width * 844 / 390)
    gap = 9
    strip = Image.new('RGB', ((width + gap) * len(items) - gap, height + 42), BACKGROUND)
    for index, (path, label) in enumerate(items):
        phone = open_frame(path).resize((width, height), Image.Resampling.LANCZOS)
        strip.paste(caption(phone, label), (index * (width + gap), 0))
    return strip


def save_gif(filename, images, durations):
    palette_frames = [image.quantize(colors=128, method=Image.Quantize.MEDIANCUT) for image in images]
    palette_frames[0].save(CAPTURES / filename, save_all=True, append_images=palette_frames[1:],
                           duration=durations, loop=0, optimize=True)


def player_round():
    images = [caption(open_frame(path), title) for path, title in [
        ('player-reading-390.png', 'Read the prompt'),
        ('player-answering-390.png', 'Submit an answer'),
        ('player-locked-390.png', 'Answer locked'),
    ]]
    for tick in CHECKS['diveFrames']['follow']:
        images.append(caption(open_frame(f'frames/player-follow-low/{tick}.png'), 'Dive'))
    images.append(caption(open_frame('player-follow-low-results-390.png'), 'Round results return'))
    save_gif('player-round.gif', images, [850, 1000, 850] + [50] * len(CHECKS['diveFrames']['follow']) + [2300])


def player_comparisons():
    bands = [('low', '+12'), ('medium', '+38'), ('high', '+72')]
    for mode in ('wide', 'follow'):
        frames = [
            phone_strip([(f'frames/player-{mode}-{band}/{tick}.png', label) for band, label in bands], width=230)
            for tick in CHECKS['diveFrames'][mode]
        ]
        settled = phone_strip([(f'player-{mode}-{band}-results-390.png', label) for band, label in bands], width=230)
        save_gif(f'{mode}-dive-tiers.gif', [*frames, settled], [50] * len(frames) + [2200])
        landing_tick = 1650 if mode == 'follow' else 1100
        phone_strip([(f'frames/player-{mode}-{band}/{landing_tick}.png', label) for band, label in bands]).save(
            CAPTURES / f'{mode}-dive-tiers.png',
        )

    phone_strip([
        ('player-locked-390.png', '1  Answer locked'),
        ('frames/player-follow-low/600.png', '2  Dive takes over'),
        ('player-follow-low-results-390.png', '3  Results return'),
    ]).save(CAPTURES / 'player-flow.png')

    phone_strip([
        ('frames/player-follow-high/100.png', 'Opening hold'),
        ('frames/player-follow-high/700.png', 'Descent'),
        ('frames/player-follow-high/1750.png', 'Landing hold'),
    ]).save(CAPTURES / 'high-dive-frames.png')


def host_round():
    images = [caption(open_frame(path).resize((960, 540), Image.Resampling.LANCZOS), label) for path, label in [
        ('host-reading-1920.png', 'Reading'),
        ('host-answering-1920.png', 'Answering'),
        ('host-ready-1920.png', '18 of 24 locked in'),
    ]]
    durations = [900, 1100, 950]
    for mode, label in [('pulse', 'Host results · sonar'), ('distribution', 'Host results · sonar and score distribution')]:
        for tick in CHECKS['hostFrames']:
            image = open_frame(f'frames/host-{mode}/{tick}.png').resize((960, 540), Image.Resampling.LANCZOS)
            images.append(caption(image, label))
            durations.append(1800 if tick == 600 else 75)
    save_gif('host-round.gif', images, durations)


player_round()
player_comparisons()
host_round()
