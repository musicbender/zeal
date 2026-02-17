'use client';

import { useEffect } from 'react';

const GLITCH_CHARS =
	'!@#$%^&*()_+-=[]{}|;:,.<>?/~`0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const GLITCH_COLORS = ['glitch-red', 'glitch-teal', 'glitch-purple', 'glitch-yellow'];

function glitchText(element: HTMLElement, finalText: string, iterations = 1, callback?: () => void) {
	let currentIteration = 0;

	function runGlitch() {
		if (currentIteration >= iterations) {
			element.textContent = finalText;
			element.className = '';
			if (callback) callback();
			return;
		}

		let glitchedText = '';
		for (let i = 0; i < finalText.length; i++) {
			glitchedText += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
		}

		const randomColor = GLITCH_COLORS[Math.floor(Math.random() * GLITCH_COLORS.length)]!;
		element.textContent = glitchedText;
		element.className = randomColor;

		currentIteration++;
		setTimeout(runGlitch, 80);
	}

	runGlitch();
}

export function useGlitchOnLoad(selector: string) {
	useEffect(() => {
		const allValues = document.querySelectorAll<HTMLElement>(selector);
		allValues.forEach((el) => {
			const currentText = el.textContent || '';
			glitchText(el, currentText, 3);
		});
	}, [selector]);
}

export function useClockGlitch(elementId: string) {
	useEffect(() => {
		let lastSecond = '';

		function updateTime() {
			const now = new Date();
			const hours = String(now.getHours()).padStart(2, '0');
			const minutes = String(now.getMinutes()).padStart(2, '0');
			const seconds = String(now.getSeconds()).padStart(2, '0');
			const timeString = `${hours}:${minutes}:${seconds}`;

			const el = document.getElementById(elementId);
			if (!el) return;

			if (lastSecond !== seconds) {
				glitchText(el, timeString, 1);
				lastSecond = seconds;
			}
		}

		updateTime();
		const interval = setInterval(updateTime, 1000);
		return () => clearInterval(interval);
	}, [elementId]);
}

export function useCoffeeGlitch(elementId: string) {
	useEffect(() => {
		let coffeeCount = 4;

		const interval = setInterval(() => {
			if (Math.random() < 0.1) {
				coffeeCount++;
				const el = document.getElementById(elementId);
				if (el) glitchText(el, String(coffeeCount), 1);
			}
		}, 30000);

		return () => clearInterval(interval);
	}, [elementId]);
}

export function useSkillRotation(
	elementId: string,
	skills: { label: string; strength: number }[],
) {
	useEffect(() => {
		if (skills.length === 0) return;

		// Build weighted pool: higher strength = more likely to appear
		const pool: string[] = [];
		for (const skill of skills) {
			const weight = Math.max(1, skill.strength);
			for (let i = 0; i < weight; i++) {
				pool.push(skill.label);
			}
		}

		let lastSkill = '';

		const interval = setInterval(() => {
			let next = pool[Math.floor(Math.random() * pool.length)]!;
			// Avoid repeating the same skill twice in a row
			if (pool.length > 1) {
				while (next === lastSkill) {
					next = pool[Math.floor(Math.random() * pool.length)]!;
				}
			}
			lastSkill = next;
			const el = document.getElementById(elementId);
			if (el) glitchText(el, next, 1);
		}, 2000);

		return () => clearInterval(interval);
	}, [elementId, skills]);
}

export function useCursorTrail() {
	useEffect(() => {
		let lastPixelTime = 0;

		function handleMouseMove(e: MouseEvent) {
			const now = Date.now();
			if (now - lastPixelTime > 100) {
				const pixel = document.createElement('div');
				pixel.className = 'cursor-pixel';
				pixel.style.left = e.pageX + 'px';
				pixel.style.top = e.pageY + 'px';
				document.body.appendChild(pixel);

				setTimeout(() => pixel.remove(), 500);
				lastPixelTime = now;
			}
		}

		document.addEventListener('mousemove', handleMouseMove);
		return () => document.removeEventListener('mousemove', handleMouseMove);
	}, []);
}

export { glitchText };
