// Copyright (c) 2026 Y-Labs. See LICENSE (PolyForm Noncommercial 1.0.0).
// [character, "name aliases…"]: \name in a note suggests the character. Names in English (with common alternatives).
module.exports = [
	["Greek", [
		["α", "alpha"], ["β", "beta"], ["γ", "gamma"], ["δ", "delta"], ["ε", "epsilon empty-word"], ["ϵ", "varepsilon epsilon2"], ["ζ", "zeta"], ["η", "eta"],
		["θ", "theta"], ["ϑ", "vartheta"], ["ι", "iota"], ["κ", "kappa"], ["λ", "lambda"], ["μ", "mu micro"], ["ν", "nu"], ["ξ", "xi"], ["ο", "omicron"],
		["π", "pi"], ["ρ", "rho"], ["σ", "sigma"], ["ς", "varsigma"], ["τ", "tau"], ["υ", "upsilon"], ["φ", "phi"], ["ϕ", "varphi"], ["χ", "chi"], ["ψ", "psi"], ["ω", "omega"],
		["Α", "Alpha"], ["Β", "Beta"], ["Γ", "Gamma"], ["Δ", "Delta"], ["Ε", "Epsilon"], ["Ζ", "Zeta"], ["Η", "Eta"], ["Θ", "Theta"], ["Ι", "Iota"], ["Κ", "Kappa"],
		["Λ", "Lambda"], ["Μ", "Mu"], ["Ν", "Nu"], ["Ξ", "Xi"], ["Ο", "Omicron"], ["Π", "Pi product"], ["Ρ", "Rho"], ["Σ", "Sigma alphabet"], ["Τ", "Tau"], ["Υ", "Upsilon"],
		["Φ", "Phi"], ["Χ", "Chi"], ["Ψ", "Psi"], ["Ω", "Omega ohm"],
	]],
	["Arrows", [
		["→", "to right arrow rightarrow transition"], ["←", "left arrow leftarrow gets"], ["↑", "up arrow uparrow"], ["↓", "down arrow downarrow"],
		["↔", "leftright both arrow"], ["⇒", "implies Rightarrow then derives"], ["⇐", "impliedby Leftarrow"], ["⇔", "iff equivalent Leftrightarrow"],
		["⟶", "longrightarrow long arrow"], ["⟹", "Longrightarrow long implies"], ["↦", "mapsto maps"], ["↗", "nearrow increases"], ["↘", "searrow decreases"],
		["⇄", "rightleftarrows exchange"], ["⇌", "equilibrium rightleftharpoons"], ["↺", "loop cycle circlearrow"], ["↪", "hookrightarrow injection"], ["↠", "twoheadrightarrow surjection"],
		["⇑", "Uparrow"], ["⇓", "Downarrow"], ["⤳", "leadsto"],
	]],
	["Logic", [
		["∀", "forall for all every"], ["∃", "exists there is"], ["∄", "nexists no"], ["¬", "not neg lnot"], ["∧", "and wedge land"], ["∨", "or vee lor"],
		["⊕", "xor oplus"], ["⊤", "top true"], ["⊥", "bot false perp bottom"], ["⊢", "vdash turnstile proves yields"], ["⊣", "dashv"], ["⊨", "models vDash entails"],
		["∴", "therefore"], ["∵", "because since"], ["≡", "equiv identical congruent"], ["⊼", "nand"], ["⊽", "nor"], ["□", "box square necessarily qed"], ["◇", "diamond possibly"], ["∎", "qed end-of-proof"],
	]],
	["Sets", [
		["∈", "in element belongs"], ["∉", "notin not-in"], ["∋", "ni contains owns"], ["⊂", "subset"], ["⊃", "supset"], ["⊆", "subseteq"], ["⊇", "supseteq"],
		["⊄", "nsubset not-subset"], ["⊊", "subsetneq proper-subset"], ["∪", "cup union"], ["∩", "cap intersection inter"], ["∖", "setminus minus difference"], ["∅", "emptyset empty null-set varnothing"],
		["ℕ", "N naturals natural"], ["ℤ", "Z integers"], ["ℚ", "Q rationals"], ["ℝ", "R reals real"], ["ℂ", "C complex"], ["℘", "powerset wp"], ["⋃", "bigcup big-union"], ["⋂", "bigcap big-intersection"],
		["×", "times cartesian product cross"], ["∁", "complement"], ["ℵ", "aleph"],
	]],
	["Relations", [
		["≤", "le leq less-equal"], ["≥", "ge geq greater-equal"], ["≠", "ne neq not-equal different"], ["≈", "approx about"], ["≅", "cong isomorphic"], ["∼", "sim similar tilde"],
		["≃", "simeq"], ["∝", "propto proportional"], ["≪", "ll much-less"], ["≫", "gg much-greater"], ["≺", "prec precedes"], ["≻", "succ succeeds"], ["≐", "doteq"],
		["≔", "coloneq define assign"], ["≜", "triangleq defined-as"], ["∣", "mid divides such-that"], ["∤", "nmid not-divides"], ["∥", "parallel"], ["⊥", "perp perpendicular orthogonal"],
		["⪯", "preceq"], ["≮", "nless"], ["≯", "ngtr"],
	]],
	["Operators", [
		["±", "pm plus-minus"], ["∓", "mp minus-plus"], ["×", "times multiply"], ["÷", "div divide"], ["·", "cdot dot middot"], ["∘", "circ compose"], ["∗", "ast star kleene"],
		["√", "sqrt root"], ["∛", "cbrt cube-root"], ["∑", "sum"], ["∏", "prod product"], ["∐", "coprod"], ["∫", "int integral"], ["∬", "iint double-integral"], ["∮", "oint contour"],
		["∂", "partial derivative"], ["∇", "nabla gradient del"], ["∞", "infty infinity"], ["′", "prime"], ["″", "dprime second"], ["‰", "permille"], ["⌊", "lfloor floor"], ["⌋", "rfloor"],
		["⌈", "lceil ceil"], ["⌉", "rceil"], ["‖", "norm Vert"], ["⊗", "otimes tensor"], ["⊙", "odot"], ["∆", "increment change"], ["⟨", "langle left-angle"], ["⟩", "rangle right-angle"],
		["∠", "angle"], ["°", "degree deg"], ["%", "percent"], ["!", "factorial"],
	]],
	["Superscript and subscript", [
		["⁰", "sup0 ^0"], ["¹", "sup1 ^1"], ["²", "sup2 squared ^2"], ["³", "sup3 cubed ^3"], ["⁴", "sup4"], ["⁵", "sup5"], ["⁶", "sup6"], ["⁷", "sup7"], ["⁸", "sup8"], ["⁹", "sup9"],
		["⁺", "sup+ supplus"], ["⁻", "sup- supminus inverse"], ["⁼", "sup="], ["⁽", "sup("], ["⁾", "sup)"], ["ⁿ", "supn ^n"], ["ⁱ", "supi"], ["ᵏ", "supk"], ["ˣ", "supx"], ["ᵀ", "supT transpose"], ["*", "supstar kleene-star"],
		["₀", "sub0 _0"], ["₁", "sub1 _1"], ["₂", "sub2 _2"], ["₃", "sub3"], ["₄", "sub4"], ["₅", "sub5"], ["₆", "sub6"], ["₇", "sub7"], ["₈", "sub8"], ["₉", "sub9"],
		["₊", "sub+"], ["₋", "sub-"], ["ₙ", "subn"], ["ᵢ", "subi"], ["ⱼ", "subj"], ["ₖ", "subk"], ["ₓ", "subx"], ["ₘ", "subm"],
	]],
	["Fractions", [["½", "half 1/2"], ["⅓", "third 1/3"], ["⅔", "two-thirds 2/3"], ["¼", "quarter 1/4"], ["¾", "three-quarters 3/4"], ["⅕", "fifth 1/5"], ["⅛", "eighth 1/8"]]],
	["Shapes and marks", [
		["•", "bullet"], ["◦", "circle-bullet"], ["…", "dots ellipsis ldots"], ["⋯", "cdots"], ["⋮", "vdots"], ["⋱", "ddots"], ["—", "emdash dash"], ["–", "endash range"],
		["✓", "check yes tick ok"], ["✗", "cross no wrong"], ["★", "star important"], ["☐", "checkbox todo"], ["☑", "checked done"], ["△", "triangle"], ["▲", "triangle-filled"],
		["○", "circle"], ["●", "dot-filled"], ["■", "square-filled"], ["◆", "diamond-filled"], ["♦", "lozenge"], ["⚠", "warning caution"], ["❗", "exclamation"], ["❓", "question"],
		["§", "section"], ["¶", "paragraph pilcrow"], ["†", "dagger"], ["‡", "ddagger"], ["©", "copyright"], ["®", "registered"], ["™", "trademark tm"],
	]],
	["Units and money", [
		["€", "euro"], ["£", "pound"], ["$", "dollar"], ["¥", "yen"], ["₣", "franc fcfa"], ["℃", "celsius"], ["℉", "fahrenheit"], ["µ", "micro mu-unit"], ["Ω", "ohm"], ["Å", "angstrom"], ["ℏ", "hbar planck"],
	]],
];
