// ==UserScript==
// @author         DOPPELGENGER,CLAUDE(MACHINA)
// @id             IITC-plugin-mod-statusbar
// @name           IITC plugin: MOD abbreviation in statusbar
// @category       d.org.addon
// @version        1.2.2
// @namespace      https://github.com/IITC-CE/ingress-intel-total-conversion
// @description    [1.2.2]ステータスバーのポータル名の前に、装着MODの略号を表示する。ON/OFFトグルと略号のユーザーカスタマイズに対応。
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    'use strict';

    if (typeof window.plugin !== 'function') window.plugin = function () {};

    plugin_info.pluginId = 'mod-statusbar';

    window.plugin.modStatusbar = function () {};
    var self = window.plugin.modStatusbar;

    // ---- 設定キー ---------------------------------------------------------
    self.KEY_ENABLED = 'plugin-mod-statusbar-enabled';
    self.KEY_MAP     = 'plugin-mod-statusbar-map';

    // ---- 既定の略号テーブル ----------------------------------------------
    // キーは "<正規化MOD名>|<RARITY>"。
    // 正規化 = 小文字化し、英数字と + - 以外を除去。
    //   "Portal Shield" / VERY_RARE      -> "portalshield|VERY_RARE"
    //   "Ito En Transmuter (+)" / VERY_RARE -> "itoentransmuter+|VERY_RARE"
    // ※ MOD名はIntelサーバ由来の生文字列であり、IITCコアには定義が無い。
    //   新MODが登場した場合は fallback の自動略号か、設定画面から追加する。
    self.defaultMap = {
        'portalshield|COMMON':           'CPS',
        'portalshield|RARE':             'RPS',
        'portalshield|VERY_RARE':        'VRPS',
        'aegisshield|VERY_RARE':         'AS',
        'multi-hack|COMMON':              'CMH',
        'multi-hack|RARE':                'RMH',
        'multi-hack|VERY_RARE':           'VMH',
        'heatsink|COMMON':               'CHS',
        'heatsink|RARE':                 'RHS',
        'heatsink|VERY_RARE':            'VRHS',
        'linkamp|RARE':                  'LA',
        'linkamp|VERY_RARE':             'VRLA',
        'softbankultralink|VERY_RARE':   '禿',
        'turret|RARE':                   'TU',
        'forceamp|RARE':                 'FA',
        'itoentransmuter+|VERY_RARE':    'IT+',
        'itoentransmuter-|VERY_RARE':    'IT-',
    };

    self.userMap = {};
    self.effectiveMap = {};
    self.enabled = true;

    // ---- 設定の読み書き ---------------------------------------------------
    self.loadSettings = function () {
        self.enabled = (localStorage[self.KEY_ENABLED] !== 'false'); // 既定ON
        try {
            self.userMap = JSON.parse(localStorage[self.KEY_MAP] || '{}') || {};
        } catch (e) {
            self.userMap = {};
        }
        self.effectiveMap = {};
        var k;
        for (k in self.defaultMap) self.effectiveMap[k] = self.defaultMap[k];
        for (k in self.userMap)    self.effectiveMap[k] = self.userMap[k];
    };

    self.saveSettings = function () {
        localStorage[self.KEY_ENABLED] = self.enabled ? 'true' : 'false';
        localStorage[self.KEY_MAP]     = JSON.stringify(self.userMap || {});
    };

    // ---- MOD -> 略号 -------------------------------------------------------
    // + と - は Transmuter (+)/(-) の識別に必須のため保持する
    self.normalize = function (name) {
        return String(name || '').toLowerCase().replace(/[^a-z0-9+\-]/g, '');
    };

    self.rarityPrefix = function (rarity) {
        switch (String(rarity || '').toUpperCase()) {
            case 'COMMON':    return 'C';
            case 'RARE':      return 'R';
            case 'VERY_RARE': return 'V';
            default:          return '';
        }
    };

    self.modToAbbr = function (mod) {
        if (!mod) return null;
        var key = self.normalize(mod.name) + '|' + String(mod.rarity || '').toUpperCase();
        if (key in self.effectiveMap) {
            // 空文字が設定されているMODは非表示扱い
            return self.effectiveMap[key] || null;
        }
        // 未知のMODは rarity頭文字 + 名前の子音2字 (+/-があれば付加) で自動生成
        var norm = self.normalize(mod.name);
        var sign = '';
        if (norm.indexOf('+') !== -1) sign = '+';
        else if (norm.indexOf('-') !== -1) sign = '-';
        var base = norm.replace(/[^a-z0-9]/g, '').replace(/[aeiou]/g, '').toUpperCase().slice(0, 2);
        return self.rarityPrefix(mod.rarity) + (base || '?') + sign;
    };

    // 選択ポータルのMOD略号列を作る（例: "AS,VM,CPS,RPS"）
    // MODは詳細データ (portalDetail) にのみ含まれる。未ロード時は空を返す。
    self.buildModString = function (guid) {
        if (!guid || !window.portalDetail) return '';
        var details = window.portalDetail.get(guid);
        if (!details || !details.mods) return '';
        var out = [];
        for (var i = 0; i < details.mods.length; i++) {
            var a = self.modToAbbr(details.mods[i]);
            if (a) out.push(a);
        }
        return out.join(',');
    };

    // ---- ステータスバーへの差し込み --------------------------------------
    // IITC.statusbar.portal.getData をラップし、返却データの title に
    // MOD略号列を前置する。ネイティブ描画 (app.setPortalStatus) と
    // HTML描画 (#mobileinfo) の両経路がこの getData を通るため、これで足りる。
    // 注意: 返却オブジェクトは _lastSentData としてキャッシュされるため、
    // 破壊せずシャローコピーへ前置する。
    self.hookGetData = function () {
        if (!(window.IITC && IITC.statusbar && IITC.statusbar.portal &&
              typeof IITC.statusbar.portal.getData === 'function')) {
            return false;
        }
        var p = IITC.statusbar.portal;
        if (p.__modOrigGetData) return true; // 二重ラップ防止
        p.__modOrigGetData = p.getData;
        p.getData = function (guid) {
            var data = p.__modOrigGetData.call(p, guid);
            if (!self.enabled || !data || !data.title) return data;
            var mods = self.buildModString(data.guid || guid);
            if (!mods) return data;
            return Object.assign({}, data, { title: mods + ',' + data.title });
        };
        return true;
    };

    // 設定変更後にステータスバーを再描画させる
    self.refresh = function () {
        if (window.IITC && IITC.statusbar && IITC.statusbar.portal && window.selectedPortal) {
            IITC.statusbar.portal.update({ selectedPortalGuid: window.selectedPortal });
        }
    };

    // ---- 設定UI ------------------------------------------------------------
    self.showSettings = function () {
        var keys = Object.keys(self.effectiveMap).sort();
        var rows = '';
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var parts = k.split('|');
            var val = self.effectiveMap[k] || '';
            rows += '<tr>' +
                '<td style="padding:2px 6px;white-space:nowrap;">' + parts[0] + ' (' + parts[1] + ')</td>' +
                '<td><input type="text" data-modkey="' + k + '" value="' + val + '" style="width:70px;"></td>' +
                '</tr>';
        }

        var html = '' +
            '<div style="margin-bottom:8px;">' +
            '<label><input type="checkbox" id="modSbEnabled"' + (self.enabled ? ' checked' : '') + '> MOD略号を表示する</label>' +
            '</div>' +
            '<div style="max-height:45vh;overflow:auto;border:1px solid #666;">' +
            '<table style="width:100%;border-collapse:collapse;">' + rows + '</table>' +
            '</div>' +
            '<p style="margin:6px 0;font-size:11px;">略号は自由に書き換えられます。空欄にするとそのMODは非表示になります。' +
            '未知のMODは「正規化名|RARITY」（例: itoentransmuter+|VERY_RARE）の形式で追加してください。' +
            '正規化名 = MOD名を小文字化し、英数字と+−以外を除去したものです。</p>' +
            '<div>新規キー: <input type="text" id="modSbNewKey" placeholder="portalshield|COMMON" style="width:145px;"> ' +
            '略号: <input type="text" id="modSbNewVal" placeholder="CPS" style="width:55px;"></div>';

        window.dialog({
            title: 'MOD Statusbar 設定',
            html: html,
            width: 380,
            buttons: {
                '保存': function () {
                    var root = this;
                    self.enabled = $(root).find('#modSbEnabled').prop('checked');

                    var newUser = {};
                    $(root).find('input[data-modkey]').each(function () {
                        var key = $(this).attr('data-modkey');
                        var v = $(this).val().trim();
                        if (v !== (self.defaultMap[key] || '')) {
                            newUser[key] = v; // 空文字も「非表示」として保持
                        }
                    });

                    var nk = $(root).find('#modSbNewKey').val().trim();
                    var nv = $(root).find('#modSbNewVal').val().trim();
                    if (nk && nv) newUser[nk] = nv;

                    self.userMap = newUser;
                    self.saveSettings();
                    self.loadSettings();
                    self.refresh();
                    $(root).dialog('close');
                },
                '閉じる': function () {
                    $(this).dialog('close');
                }
            }
        });
    };

    // ---- setup --------------------------------------------------------------
    var setup = function () {
        self.loadSettings();

        if (!self.hookGetData()) {
            // このビルドに statusbar API が無い場合は明示的に失敗させ、
            // 打ち消し線でロード不可を可視化する
            throw new Error('IITC.statusbar.portal.getData not found (incompatible IITC build)');
        }

        // ツールボックスに設定リンクを追加
        $('#toolbox').append(
            $('<a>', {
                text: 'MOD Statusbar',
                title: 'ステータスバーのMOD略号表示を設定',
                click: function () { self.showSettings(); return false; }
            })
        );
    };

    setup.info = plugin_info;
    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded && typeof setup === 'function') setup();
}

// ---- inject -----------------------------------------------------------------
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    info.script = {
        version: GM_info.script.version,
        name: GM_info.script.name,
        description: GM_info.script.description
    };
}
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
