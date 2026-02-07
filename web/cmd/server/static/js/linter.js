// Simplex Linter - Client-side spec validator
// Ported from legacy-simplex-web/lib/simplex-linter.ts

const LINT_CONFIG = {
    maxRules: 15,
    maxInputs: 6,
    maxRuleLength: 200,
    maxFunctions: 10
};

const FUNCTION_LANDMARK_NAMES = new Set([
    'RULES', 'DONE_WHEN', 'EXAMPLES', 'ERRORS',
    'READS', 'WRITES', 'TRIGGERS', 'NOT_ALLOWED',
    'HANDOFF', 'UNCERTAIN', 'BASELINE', 'EVAL', 'DETERMINISM'
]);

const LANDMARK_REGEX = /^([A-Z][A-Z_]+):\s*(.*)$/gm;
const FUNCTION_SIG_REGEX = /^(\w+)\s*\(([^)]*)\)\s*(?:→|->)\s*(.+)$/;
const THRESHOLD_REGEX = /^pass[\^@]\d+$/;

// --- Parser ---

function parseSpec(text) {
    const spec = { functions: [], dataBlocks: [], constraints: [], rawText: text };

    const matches = [];
    const regex = new RegExp(LANDMARK_REGEX.source, 'gm');
    let m;
    while ((m = regex.exec(text)) !== null) {
        matches.push({
            name: m[1],
            content: (m[2] || '').trim(),
            lineNumber: text.substring(0, m.index).split('\n').length,
            startIndex: m.index,
            endIndex: m.index + m[0].length
        });
    }

    if (matches.length === 0) return spec;

    // Extract content between landmarks
    const landmarks = [];
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const contentStart = match.endIndex;
        const contentEnd = i + 1 < matches.length ? matches[i + 1].startIndex : text.length;
        let content = text.substring(contentStart, contentEnd).trim();
        if (match.content) {
            content = content ? match.content + '\n' + content : match.content;
        }
        landmarks.push({ name: match.name, content, lineNumber: match.lineNumber });
    }

    // Organize into functions, data blocks, constraints
    let currentFunction = null;
    for (const lm of landmarks) {
        if (lm.name === 'FUNCTION') {
            const fn = parseFunctionBlock(lm);
            spec.functions.push(fn);
            currentFunction = fn;
        } else if (lm.name === 'DATA') {
            spec.dataBlocks.push(lm);
            currentFunction = null;
        } else if (lm.name === 'CONSTRAINT') {
            spec.constraints.push(lm);
            currentFunction = null;
        } else if (FUNCTION_LANDMARK_NAMES.has(lm.name)) {
            if (currentFunction) {
                currentFunction.landmarks.set(lm.name, lm);
            }
        }
    }

    return spec;
}

function parseFunctionBlock(lm) {
    const fn = {
        signature: '',
        name: '',
        inputs: [],
        returnType: '',
        landmarks: new Map(),
        lineNumber: lm.lineNumber
    };

    let sigLine = lm.content;
    const newlineIdx = lm.content.indexOf('\n');
    if (newlineIdx >= 0) {
        sigLine = lm.content.substring(0, newlineIdx);
    }
    sigLine = sigLine.trim();
    fn.signature = sigLine;

    const matches = FUNCTION_SIG_REGEX.exec(sigLine);
    if (matches && matches.length >= 4) {
        fn.name = matches[1];
        fn.returnType = matches[3].trim();
        const inputStr = matches[2].trim();
        if (inputStr) {
            fn.inputs = inputStr.split(',').map(s => s.trim()).filter(s => s);
        }
    } else {
        fn.name = sigLine;
    }

    return fn;
}

// --- Helpers ---

function fnLoc(name) {
    return name ? 'FUNCTION ' + name : 'FUNCTION (unnamed)';
}

function getLandmark(fn, name) {
    const lm = fn.landmarks.get(name);
    return lm ? lm.content : '';
}

function extractRuleItems(rules) {
    const items = [];
    const lines = rules.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0 && trimmed[0] === '-') {
            const item = trimmed.substring(1).trim();
            if (item) items.push(item);
        }
    }

    if (items.length === 0) {
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) items.push(trimmed);
        }
    }

    return items;
}

function countExamples(examples) {
    let count = 0;
    for (const line of examples.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed[0] === '(' || trimmed.includes('\u2192') || trimmed.includes('->')) {
            count++;
        }
    }
    return count;
}

function countBranches(rulesContent) {
    const content = rulesContent.toLowerCase();
    let count = 0;

    const ifOrMatches = (content.match(/\bif\b[^,\n]*\bor\b/g) || []).length;
    count += ifOrMatches * 2;

    const ifElseMatches = (content.match(/\bif\b[^,\n]*(otherwise|else)\b/g) || []).length;
    count += ifElseMatches * 2;

    const allIfs = (content.match(/\bif\b/g) || []).length;
    const simpleIfs = allIfs - ifOrMatches - ifElseMatches;
    if (simpleIfs > 0) count += simpleIfs;

    count += (content.match(/\bwhen\b/g) || []).length;
    count += (content.match(/\boptionally\b/g) || []).length * 2;
    count += (content.match(/\beither\b[^,\n]*\bor\b/g) || []).length * 2;

    if (count === 0 && rulesContent.trim()) count = 1;

    return count;
}

// --- Checks ---

function checkFunctionExists(spec, result) {
    if (spec.functions.length === 0) {
        result.errors.push({ code: 'E001', message: 'No FUNCTION block found', location: 'spec' });
    }
}

function checkRequiredLandmarks(spec, result) {
    const required = [
        ['RULES', 'E002'],
        ['DONE_WHEN', 'E003'],
        ['EXAMPLES', 'E004'],
        ['ERRORS', 'E005']
    ];

    for (const fn of spec.functions) {
        const loc = fnLoc(fn.name);
        for (const [landmark, code] of required) {
            if (!fn.landmarks.has(landmark)) {
                result.errors.push({
                    code,
                    message: 'FUNCTION missing ' + landmark + ' landmark',
                    location: loc
                });
            }
        }
    }
}

function checkDataReferences(spec, result) {
    if (spec.dataBlocks.length === 0) return;

    const builtins = new Set([
        'string', 'int', 'integer', 'number', 'bool', 'boolean',
        'float', 'double', 'list', 'array', 'map', 'dict',
        'any', 'void', 'none', 'null', 'result', 'output',
        'sum', 'filtered', 'valid', 'issues', 'timestamp', 'id'
    ]);

    const definedTypes = new Set();
    for (const data of spec.dataBlocks) {
        const name = data.content.split(/[\s\n]/)[0];
        if (name) definedTypes.add(name.toLowerCase());
    }

    for (const fn of spec.functions) {
        if (!fn.returnType) continue;
        let normalized = fn.returnType.toLowerCase().replace(/[\s_]/g, '');
        for (const prefix of ['listof', 'arrayof', 'setof']) {
            if (normalized.startsWith(prefix) && normalized.length > prefix.length) {
                normalized = normalized.substring(prefix.length);
                break;
            }
        }
        if (!builtins.has(normalized) && !definedTypes.has(normalized) && !definedTypes.has(fn.returnType.toLowerCase())) {
            result.warnings.push({
                code: 'E006',
                message: "Return type '" + fn.returnType + "' may reference undefined DATA type",
                location: fnLoc(fn.name)
            });
        }
    }
}

function checkComplexity(spec, result) {
    if (spec.functions.length > LINT_CONFIG.maxFunctions) {
        result.warnings.push({
            code: 'W011',
            message: 'Spec has ' + spec.functions.length + ' FUNCTION blocks (max recommended: ' + LINT_CONFIG.maxFunctions + ')',
            location: 'spec'
        });
    }

    for (const fn of spec.functions) {
        const loc = fnLoc(fn.name);

        // Input count
        if (fn.inputs.length > LINT_CONFIG.maxInputs) {
            result.errors.push({
                code: 'E011',
                message: 'FUNCTION has ' + fn.inputs.length + ' inputs (max ' + LINT_CONFIG.maxInputs + ')',
                location: loc
            });
        }

        // Rules complexity
        const rules = getLandmark(fn, 'RULES');
        if (rules) {
            const items = extractRuleItems(rules);
            if (items.length > LINT_CONFIG.maxRules) {
                result.errors.push({
                    code: 'E010',
                    message: 'RULES block has ' + items.length + ' items (max ' + LINT_CONFIG.maxRules + ')',
                    location: loc
                });
            }
            for (let i = 0; i < items.length; i++) {
                if (items[i].length > LINT_CONFIG.maxRuleLength) {
                    result.warnings.push({
                        code: 'W010',
                        message: 'RULES item ' + (i + 1) + ' exceeds ' + LINT_CONFIG.maxRuleLength + ' characters (' + items[i].length + ' chars)',
                        location: loc
                    });
                }
            }
        }

        // Example coverage
        const examples = getLandmark(fn, 'EXAMPLES');
        if (rules && examples) {
            const branchCount = countBranches(rules);
            const exampleCount = countExamples(examples);
            if (exampleCount < branchCount) {
                result.errors.push({
                    code: 'E012',
                    message: 'EXAMPLES has ' + exampleCount + ' items but RULES has ' + branchCount + ' branches',
                    location: loc
                });
            }
        }
    }
}

function checkEvolution(spec, result) {
    for (const fn of spec.functions) {
        const hasBaseline = fn.landmarks.has('BASELINE');
        const hasEval = fn.landmarks.has('EVAL');
        const loc = fnLoc(fn.name);

        if (hasBaseline && !hasEval) {
            result.errors.push({
                code: 'E060',
                message: 'BASELINE present without EVAL landmark',
                location: loc
            });
        }

        if (hasBaseline) {
            const content = getLandmark(fn, 'BASELINE').toLowerCase();
            if (!content.includes('reference:') && !content.includes('reference :')) {
                result.errors.push({ code: 'E050', message: "BASELINE missing 'reference' field", location: loc });
            }
            if (!content.includes('preserve:') && !content.includes('preserve :')) {
                result.errors.push({ code: 'E051', message: "BASELINE missing 'preserve' field", location: loc });
            }
            if (!content.includes('evolve:') && !content.includes('evolve :')) {
                result.errors.push({ code: 'E052', message: "BASELINE missing 'evolve' field", location: loc });
            }
        }

        if (hasEval) {
            const evalContent = getLandmark(fn, 'EVAL');
            const lines = evalContent.split('\n');
            let hasPreserve = false, hasEvolveField = false, hasGrading = false;
            let preserveVal = '', evolveVal = '', gradingVal = '';

            for (const line of lines) {
                const trimmed = line.trim().toLowerCase();
                if (trimmed.startsWith('preserve:') || trimmed.startsWith('preserve :')) {
                    hasPreserve = true;
                    preserveVal = (trimmed.split(':')[1] || '').trim();
                } else if (trimmed.startsWith('evolve:') || trimmed.startsWith('evolve :')) {
                    hasEvolveField = true;
                    evolveVal = (trimmed.split(':')[1] || '').trim();
                } else if (trimmed.startsWith('grading:') || trimmed.startsWith('grading :')) {
                    hasGrading = true;
                    gradingVal = (trimmed.split(':')[1] || '').trim();
                }
            }

            if (!hasPreserve) {
                result.errors.push({ code: 'E061', message: "EVAL missing 'preserve' threshold", location: loc });
            }
            if (!hasEvolveField) {
                result.errors.push({ code: 'E062', message: "EVAL missing 'evolve' threshold", location: loc });
            }
            if (hasPreserve && preserveVal && !THRESHOLD_REGEX.test(preserveVal)) {
                result.errors.push({ code: 'E063', message: "Invalid preserve threshold '" + preserveVal + "' (expected pass^k or pass@k)", location: loc });
            }
            if (hasEvolveField && evolveVal && !THRESHOLD_REGEX.test(evolveVal)) {
                result.errors.push({ code: 'E064', message: "Invalid evolve threshold '" + evolveVal + "' (expected pass^k or pass@k)", location: loc });
            }
            if (hasGrading && gradingVal && !['code', 'model', 'outcome'].includes(gradingVal)) {
                result.errors.push({ code: 'E065', message: "Invalid grading type '" + gradingVal + "' (expected: code, model, or outcome)", location: loc });
            }
        }
    }
}

function checkDeterminism(spec, result) {
    for (const fn of spec.functions) {
        if (!fn.landmarks.has('DETERMINISM')) continue;

        const content = getLandmark(fn, 'DETERMINISM');
        const loc = fnLoc(fn.name) + ' DETERMINISM';
        let level = '';

        for (const line of content.split('\n')) {
            const trimmed = line.trim().toLowerCase();
            if (trimmed.startsWith('level:') || trimmed.startsWith('level :')) {
                level = (trimmed.split(':')[1] || '').trim();
            }
        }

        if (!level) {
            result.errors.push({ code: 'E070', message: 'DETERMINISM requires level field (strict, structural, or semantic)', location: loc });
        } else if (!['strict', 'structural', 'semantic'].includes(level)) {
            result.errors.push({ code: 'E070', message: 'DETERMINISM level must be strict, structural, or semantic, got: ' + level, location: loc });
        }
    }
}

// --- Main lint function ---

function lintSpec(text) {
    const result = { valid: true, errors: [], warnings: [] };
    const spec = parseSpec(text);

    checkFunctionExists(spec, result);
    if (spec.functions.length === 0) {
        result.valid = result.errors.length === 0;
        return result;
    }

    checkRequiredLandmarks(spec, result);
    checkDataReferences(spec, result);
    checkComplexity(spec, result);
    checkEvolution(spec, result);
    checkDeterminism(spec, result);

    result.valid = result.errors.length === 0;
    return result;
}
