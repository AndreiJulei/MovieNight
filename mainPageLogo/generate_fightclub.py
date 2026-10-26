import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

def create_fightclub_banner(
    character_img_path="fightclub-removebg-preview.png",
    output_path="fightclub_marvel_anton_pink.png",
    font_path="fonts/Anton.ttf",
    canvas_w=2560,
    canvas_h=1440,
    font_size=555,
    vertical_stretch=1.32,
    top_y=0,                    # Moved higher flush to the top of the canvas
    gap=50,                     # Tight cohesive gap between MOVIE and NIGHT
    accent_color=(245, 68, 142),# Fight Club Soap Pink (#f5448e)
    transparent_bg=False,
    add_glow=True,
    char_scale_h=1200,          # Grounded characters (83.3% height) pinned to bottom
    char_x_offset=0
):
    """
    Generates high-impact Fight Club (Tyler Durden & Narrator) desktop hero banner
    with towering Anton Marvel All-Caps typography (font_size=555) flush at top_y=0,
    centered between and behind the characters.
    """
    # 1. Typography (Anton All-Caps with Marvel-style Vertical Stretch)
    font = ImageFont.truetype(font_path, font_size)

    def render_stretched_word(text, fill_color):
        bbox = font.getbbox(text)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        temp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(temp)
        d.text((-bbox[0], -bbox[1]), text, font=font, fill=fill_color)
        new_h = int(h * vertical_stretch)
        return temp.resize((w, new_h), Image.Resampling.LANCZOS)

    word_m_img = render_stretched_word("MOVIE", (255, 255, 255, 255))
    word_n_img = render_stretched_word("NIGHT", (*accent_color[:3], 255))

    m_y = top_y
    n_y = top_y
    center_y = m_y + (word_m_img.height // 2)

    # Balanced horizontal centering across the canvas
    total_w = word_m_img.width + gap + word_n_img.width
    left_x = (canvas_w - total_w) // 2
    right_x = left_x + word_m_img.width + gap

    # 2. Canvas Setup
    if transparent_bg:
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    else:
        # Deep dark cinematic backdrop
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (6, 7, 10, 255))
        
        # Atmospheric backlight halo behind characters & logo
        bg = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        bg_draw = ImageDraw.Draw(bg)
        cx, cy = canvas_w // 2, center_y
        for r in range(int(canvas_h * 0.55), 0, -20):
            norm = 1.0 - (r / (canvas_h * 0.55))
            alpha = int(45 * (norm ** 1.5))
            bg_draw.ellipse(
                (cx - int(r * 1.8), cy - r, cx + int(r * 1.8), cy + r),
                fill=(*accent_color[:3], alpha)
            )
        bg = bg.filter(ImageFilter.GaussianBlur(radius=60))
        canvas.alpha_composite(bg)

    # 3. Text Glow Layer
    if add_glow and not transparent_bg:
        glow = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        gm = render_stretched_word("MOVIE", (255, 255, 255, 120))
        gn = render_stretched_word("NIGHT", (*accent_color[:3], 180))
        glow.alpha_composite(gm, (left_x, m_y))
        glow.alpha_composite(gn, (right_x, n_y))
        glow = glow.filter(ImageFilter.GaussianBlur(radius=24))
        canvas.alpha_composite(glow)

    # Paste text onto canvas
    canvas.alpha_composite(word_m_img, (left_x, m_y))
    canvas.alpha_composite(word_n_img, (right_x, n_y))

    # 4. Foreground Characters Cutout (Tyler Durden & The Narrator)
    char_raw = Image.open(character_img_path).convert("RGBA")
    scale = char_scale_h / char_raw.height
    cw = int(char_raw.width * scale)
    char_img = char_raw.resize((cw, char_scale_h), Image.Resampling.LANCZOS)
    cx_pos = ((canvas_w - cw) // 2) + char_x_offset
    cy_pos = canvas_h - char_scale_h

    # Subtle cinematic character rim glow
    if add_glow and not transparent_bg:
        rim = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        c_alpha = char_img.split()[3]
        c_glow = Image.new("RGBA", char_img.size, (*accent_color[:3], 75))
        c_glow.putalpha(c_alpha)
        rim.paste(c_glow, (cx_pos, cy_pos), c_alpha)
        rim = rim.filter(ImageFilter.GaussianBlur(radius=22))
        canvas.alpha_composite(rim)

    # Composite characters in front of typography
    canvas.alpha_composite(char_img, (cx_pos, cy_pos))

    # 5. Bottom Vignette
    if not transparent_bg:
        fade = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        fd = ImageDraw.Draw(fade)
        fh = int(canvas_h * 0.10)
        for y in range(canvas_h - fh, canvas_h):
            prog = (y - (canvas_h - fh)) / fh
            fd.line([(0, y), (canvas_w, y)], fill=(6, 7, 10, int(255 * (prog ** 1.8))))
        canvas.alpha_composite(fade)

    canvas.save(output_path, "PNG", quality=95)
    center_x = (left_x + right_x + word_n_img.width) / 2
    bottom_y = top_y + word_m_img.height
    print(f"Generated {output_path} successfully (span=[{left_x}, {right_x + word_n_img.width}], center_x={center_x:.1f}, top_y={top_y}, bottom_y={bottom_y})")

if __name__ == "__main__":
    # 1. Primary: Fight Club Soap Pink Edition (#f5448e)
    create_fightclub_banner(
        output_path="fightclub_marvel_anton_pink.png",
        accent_color=(245, 68, 142)
    )

    # 2. Movie Night Violet Accent (#6355ff)
    create_fightclub_banner(
        output_path="fightclub_marvel_anton_violet.png",
        accent_color=(99, 85, 255)
    )

    # 3. Transparent PNG (Pink)
    create_fightclub_banner(
        output_path="fightclub_transparent_pink.png",
        accent_color=(245, 68, 142),
        transparent_bg=True,
        add_glow=False
    )

    # 4. Transparent PNG (Violet)
    create_fightclub_banner(
        output_path="fightclub_transparent_violet.png",
        accent_color=(99, 85, 255),
        transparent_bg=True,
        add_glow=False
    )
