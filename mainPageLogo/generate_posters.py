import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

def create_character_banner(
    character_img_path,
    output_path,
    font_path="fonts/Anton.ttf",
    text_left="MOVIE",
    text_right="NIGHT",
    canvas_w=2560,
    canvas_h=1440,
    transparent_bg=False,
    font_size=460,
    vertical_stretch=1.35, # Stretch up and down like Marvel logo
    overlap_px=140,
    accent_color=(99, 85, 255), # #6355ff
    add_glow=True,
    character_scale=0.92,
    optical_x_offset=0,     # Optical center correction if needed
    text_center_y_ratio=0.46,
    lightsaber_glow=False   # If True, add red lightsaber flare on bottom-left
):
    # 1. Base Canvas
    if transparent_bg:
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    else:
        # Deep dark cinematic void
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (6, 7, 10, 255))
        
        # Atmospheric backlight behind character & logo
        bg_effects = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        bg_draw = ImageDraw.Draw(bg_effects)
        
        cx, cy = canvas_w // 2, int(canvas_h * 0.48)
        
        # Soft atmospheric radial glow
        for r in range(int(canvas_h * 0.6), 0, -20):
            norm = 1.0 - (r / (canvas_h * 0.6))
            alpha = int(50 * (norm ** 1.5))
            bg_draw.ellipse(
                (cx - int(r * 1.8), cy - r, cx + int(r * 1.8), cy + r),
                fill=(*accent_color[:3], alpha)
            )
            
        # Optional lightsaber glow on bottom left for Vader
        if lightsaber_glow:
            saber_x, saber_y = int(canvas_w * 0.38), int(canvas_h * 0.85)
            for r in range(400, 0, -25):
                norm = 1.0 - (r / 400.0)
                alpha = int(35 * (norm ** 2))
                bg_draw.ellipse(
                    (saber_x - r, saber_y - int(r * 1.6), saber_x + r, saber_y + int(r * 1.6)),
                    fill=(255, 30, 40, alpha)
                )
        
        bg_effects = bg_effects.filter(ImageFilter.GaussianBlur(radius=55))
        canvas.alpha_composite(bg_effects)

    # 2. Prepare Character Cutout
    char_raw = Image.open(character_img_path).convert("RGBA")
    target_char_h = int(canvas_h * character_scale)
    scale_factor = target_char_h / char_raw.height
    target_char_w = int(char_raw.width * scale_factor)
    char_img = char_raw.resize((target_char_w, target_char_h), Image.Resampling.LANCZOS)
    
    # Optical center alignment
    char_x = ((canvas_w - target_char_w) // 2) + optical_x_offset
    char_y = canvas_h - target_char_h  # Pinned to bottom

    # 3. Typography setup (Render large text with Marvel vertical stretch)
    font = ImageFont.truetype(font_path, font_size)

    def render_stretched_word(text, fill_color):
        bbox = font.getbbox(text)
        text_w = bbox[2] - bbox[0] + 40
        text_h = bbox[3] - bbox[1] + 40
        
        temp_img = Image.new("RGBA", (text_w, text_h), (0, 0, 0, 0))
        temp_draw = ImageDraw.Draw(temp_img)
        draw_x = -bbox[0] + 20
        draw_y = -bbox[1] + 20
        temp_draw.text((draw_x, draw_y), text, font=font, fill=fill_color)
        
        if vertical_stretch != 1.0:
            new_h = int(text_h * vertical_stretch)
            temp_img = temp_img.resize((text_w, new_h), Image.Resampling.LANCZOS)
            
        return temp_img, bbox

    word_m_img, bbox_m = render_stretched_word(text_left, (255, 255, 255, 255))
    word_n_img, bbox_n = render_stretched_word(text_right, (*accent_color, 255))

    # Center Y for text
    center_y = int(canvas_h * text_center_y_ratio)
    m_y = center_y - (word_m_img.height // 2)
    n_y = center_y - (word_n_img.height // 2)

    # Find character boundary at center_y
    rel_y = center_y - char_y
    alpha_arr = np.array(char_img.split()[3])
    row_idx = np.clip(rel_y, 0, target_char_h - 1)
    body_pixels = np.where(alpha_arr[row_idx, :] > 30)[0]
    
    if len(body_pixels) > 0:
        body_left = char_x + body_pixels[0]
        body_right = char_x + body_pixels[-1]
    else:
        body_left = char_x + int(100 * scale_factor)
        body_right = char_x + int(char_raw.width * 0.8 * scale_factor)

    # Placement:
    left_x = (body_left + overlap_px) - word_m_img.width + 20
    right_x = (body_right - overlap_px) - 20

    # Draw Glow Layer
    if add_glow:
        glow_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        # White glow for Movie
        glow_m, _ = render_stretched_word(text_left, (255, 255, 255, 110))
        glow_layer.alpha_composite(glow_m, (left_x, m_y))
        # Accent glow for Night
        glow_n, _ = render_stretched_word(text_right, (*accent_color, 180))
        glow_layer.alpha_composite(glow_n, (right_x, n_y))
        glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=22))
        canvas.alpha_composite(glow_layer)

    # Paste text onto canvas
    canvas.alpha_composite(word_m_img, (left_x, m_y))
    canvas.alpha_composite(word_n_img, (right_x, n_y))

    # 4. Composite Character in FRONT of text
    if add_glow and not transparent_bg:
        rim = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        c_alpha = char_img.split()[3]
        c_glow = Image.new("RGBA", char_img.size, (*accent_color, 100))
        c_glow.putalpha(c_alpha)
        rim.paste(c_glow, (char_x, char_y), c_alpha)
        rim = rim.filter(ImageFilter.GaussianBlur(radius=20))
        canvas.alpha_composite(rim)

    canvas.alpha_composite(char_img, (char_x, char_y))

    # 5. Bottom subtle vignette
    if not transparent_bg:
        bottom_fade = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        fade_draw = ImageDraw.Draw(bottom_fade)
        fade_h = int(canvas_h * 0.12)
        for y in range(canvas_h - fade_h, canvas_h):
            prog = (y - (canvas_h - fade_h)) / fade_h
            alpha = int(255 * (prog ** 1.8))
            fade_draw.line([(0, y), (canvas_w, y)], fill=(6, 7, 10, alpha))
        canvas.alpha_composite(bottom_fade)

    canvas.save(output_path, "PNG", quality=95)
    print(f"Generated {output_path} successfully (char_x={char_x}, body_left={body_left}, body_right={body_right})")

if __name__ == "__main__":
    # =========================================================================
    # 1. JOKER BANNERS (pngegg-7.png)
    # =========================================================================
    create_character_banner(
        character_img_path="pngegg-7.png",
        output_path="joker_marvel_anton_allcaps.png",
        font_path="fonts/Anton.ttf",
        text_left="MOVIE",
        text_right="NIGHT",
        font_size=460,
        vertical_stretch=1.35,
        overlap_px=140,
        accent_color=(99, 85, 255),
        character_scale=0.90
    )

    # =========================================================================
    # 2. DARTH VADER STANDING (pngegg.png)
    # =========================================================================
    vader_offset = -24
    create_character_banner(
        character_img_path="pngegg.png",
        output_path="vader_marvel_anton_allcaps.png",
        font_path="fonts/Anton.ttf",
        text_left="MOVIE",
        text_right="NIGHT",
        font_size=460,
        vertical_stretch=1.35,
        overlap_px=140,
        accent_color=(99, 85, 255),
        character_scale=0.94,
        optical_x_offset=vader_offset
    )

    # =========================================================================
    # 3. DARTH VADER CROSSED ARMS (pngegg-3.png)
    # =========================================================================
    # 3A. Brand Violet Accent (#6355ff)
    create_character_banner(
        character_img_path="pngegg-3.png",
        output_path="vader_crossed_marvel_anton_allcaps.png",
        font_path="fonts/Anton.ttf",
        text_left="MOVIE",
        text_right="NIGHT",
        font_size=460,
        vertical_stretch=1.35,
        overlap_px=65,  # Perfect overlap for wider helmet/shoulder profile
        accent_color=(99, 85, 255),
        character_scale=0.82
    )

    # 3B. Sith Crimson Red Accent (#ef4444)
    create_character_banner(
        character_img_path="pngegg-3.png",
        output_path="vader_crossed_marvel_anton_sith_red.png",
        font_path="fonts/Anton.ttf",
        text_left="MOVIE",
        text_right="NIGHT",
        font_size=460,
        vertical_stretch=1.35,
        overlap_px=65,
        accent_color=(239, 68, 68),
        character_scale=0.82
    )

    # 3C. Title Case ("Movie Night")
    create_character_banner(
        character_img_path="pngegg-3.png",
        output_path="vader_crossed_marvel_anton_titlecase.png",
        font_path="fonts/Anton.ttf",
        text_left="Movie",
        text_right="Night",
        font_size=460,
        vertical_stretch=1.35,
        overlap_px=65,
        accent_color=(99, 85, 255),
        character_scale=0.82
    )

    # 3D. Transparent Background PNG
    create_character_banner(
        character_img_path="pngegg-3.png",
        output_path="vader_crossed_transparent.png",
        font_path="fonts/Anton.ttf",
        text_left="MOVIE",
        text_right="NIGHT",
        font_size=460,
        vertical_stretch=1.35,
        overlap_px=65,
        accent_color=(99, 85, 255),
        transparent_bg=True,
        add_glow=False,
        character_scale=0.82
    )
