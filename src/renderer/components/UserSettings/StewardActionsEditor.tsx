import React from 'react';
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import {
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  MAX_STEWARD_ACTION_LABEL_LENGTH,
  StewardAction,
  stewardActionShortcut,
  validateStewardActions,
} from '../../utils/stewardActions';
import {
  DEFAULT_STEWARD_ANNOUNCEMENT,
  MAX_STEWARD_ANNOUNCEMENT_LENGTH,
  STEWARD_NAME_PLACEHOLDER,
  formatIncidentChatMessage,
  formatPenaltyChatMessage,
  resolveStewardAnnouncement,
} from '../../utils/stewardChat';
import {
  SERVER_COMMAND_KIND_OPTIONS,
  StewardServerCommandKind,
  serverCommandOfKind,
} from '../../utils/simgridCommands';

interface Props {
  /**
   * The tariff being edited, always resolved — the caller hands down the shipped
   * defaults when nothing is stored, so this component never needs to know a
   * default exists.
   */
  actions: StewardAction[];
  /** True when nothing is stored, which is what disables "revert". */
  isAtDefaults: boolean;
  onChange: (next: StewardAction[]) => void;
  onRevert: () => void;
  /** The chat announcement wording as typed; empty means the shipped wording. */
  announcement: string;
  onChangeAnnouncement: (next: string) => void;
  /** The steward name as typed, for previewing the announcement. */
  stewardName: string;
  disabled?: boolean;
}

/** Stand-ins for the previews, so a row shows the line it would produce. */
const PREVIEW_DRIVERS = [
  { displayName: 'Driver One', carNumber: '7' },
  { displayName: 'Driver Two', carNumber: '51' },
];

/** Editing identity only, and only ever handed to rows created here. */
let nextLocalId = 0;
const newActionId = (): string => {
  nextLocalId += 1;
  return `sa-new-${Date.now()}-${nextLocalId}`;
};

/**
 * Configures the action buttons both dossiers offer, and what each one says in
 * the in-game chat.
 *
 * The label is the value: what is typed here is what the button says, what the
 * decision stores and what every export carries, so a league matches whatever
 * their spreadsheet already uses rather than translating twice.
 *
 * Order matters — it decides which action gets which number key — so rows can be
 * moved rather than only added and removed.
 */
export const StewardActionsEditor: React.FC<Props> = ({
  actions,
  isAtDefaults,
  onChange,
  onRevert,
  announcement,
  onChangeAnnouncement,
  stewardName,
  disabled = false,
}) => {
  const { errorByActionId } = validateStewardActions(actions);

  const replaceAt = (index: number, next: Partial<StewardAction>) =>
    onChange(
      actions.map((action, at) =>
        at === index ? { ...action, ...next } : action,
      ),
    );

  const moveBy = (index: number, step: number) => {
    const to = index + step;
    if (to < 0 || to >= actions.length) {
      return;
    }

    const reordered = [...actions];
    [reordered[index], reordered[to]] = [reordered[to], reordered[index]];
    onChange(reordered);
  };

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 2,
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        sx={{ mb: 1.5 }}
      >
        <Box sx={{ pr: 2 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            Decision Actions &amp; Chat Messages
          </Typography>
          <Typography variant="caption" color="text.secondary">
            The buttons offered when you call an incident, live and in
            post-session review, and what each one says in the in-game chat. The
            label is what the decision records and what CSV, Markdown and JSON
            exports carry, so it can match your league&apos;s own wording. The
            chat text is optional: leave it blank to say the label. The server
            penalty is what the SimGrid connector applies for that action, after
            asking you. The first nine get keyboard shortcuts in the order
            below. Decisions already made keep the wording they were made under,
            whatever you change here.
          </Typography>
        </Box>
        <Tooltip
          title={
            isAtDefaults
              ? 'Already using the shipped actions.'
              : 'Discard these and go back to the shipped actions.'
          }
        >
          {/*
            Held at its natural width. The description beside it is a full
            paragraph, and left to flex the button wrapped to three stacked
            words.
          */}
          <span style={{ flexShrink: 0 }}>
            <Button
              size="small"
              startIcon={<RestartAltIcon />}
              onClick={onRevert}
              disabled={disabled || isAtDefaults}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Revert to default
            </Button>
          </span>
        </Tooltip>
      </Stack>

      <Stack spacing={1}>
        {actions.map((action, index) => {
          const shortcut = stewardActionShortcut(index);
          const error = errorByActionId[action.id];
          const said = action.chatLabel?.trim() || action.label.trim();
          /*
            The line this row would post, so the two shapes are visible rather
            than described: a call against a driver names one, a finding about
            the incident lists everyone in it.
          */
          const preview = action.driverScoped
            ? formatPenaltyChatMessage(PREVIEW_DRIVERS[0], said, 'Reason')
            : formatIncidentChatMessage(said, PREVIEW_DRIVERS, 'Reason');

          return (
            <Stack
              key={action.id}
              direction="row"
              spacing={1}
              alignItems="flex-start"
            >
              {/*
                The key this row answers to, shown rather than set. Derived from
                the position, so moving a row moves its shortcut with it and
                there is no collision to validate.
              */}
              <Chip
                size="small"
                label={shortcut ?? '—'}
                variant="outlined"
                sx={{ mt: 0.5, minWidth: 44 }}
              />
              <TextField
                size="small"
                fullWidth
                value={action.label}
                error={Boolean(error)}
                helperText={error ?? (said ? preview : undefined)}
                inputProps={{
                  maxLength: MAX_STEWARD_ACTION_LABEL_LENGTH,
                  'aria-label': `Action ${index + 1} label`,
                }}
                onChange={(changeEvent) =>
                  replaceAt(index, { label: changeEvent.target.value })
                }
                disabled={disabled}
              />
              <TextField
                size="small"
                sx={{ minWidth: 190 }}
                value={action.chatLabel ?? ''}
                placeholder={action.label.trim() || 'Chat text'}
                inputProps={{
                  maxLength: MAX_STEWARD_ACTION_LABEL_LENGTH,
                  'aria-label': `Action ${index + 1} chat text`,
                }}
                onChange={(changeEvent) =>
                  replaceAt(index, { chatLabel: changeEvent.target.value })
                }
                disabled={disabled}
              />
              {/*
                What this action does on the server, through the SimGrid
                connector — nothing, unless set. Only offered on a call against
                one driver: a server penalty has to land on somebody.
              */}
              <TextField
                select
                size="small"
                sx={{ minWidth: 150 }}
                value={
                  action.driverScoped ? (action.serverCommand?.kind ?? '') : ''
                }
                SelectProps={{ native: true }}
                inputProps={{
                  'aria-label': `Action ${index + 1} server penalty`,
                }}
                onChange={(changeEvent) =>
                  replaceAt(index, {
                    serverCommand: serverCommandOfKind(
                      changeEvent.target.value as StewardServerCommandKind | '',
                      action.serverCommand && 'seconds' in action.serverCommand
                        ? action.serverCommand.seconds
                        : undefined,
                    ),
                  })
                }
                disabled={disabled || !action.driverScoped}
              >
                <option value="">No server penalty</option>
                {SERVER_COMMAND_KIND_OPTIONS.map((option) => (
                  <option key={option.kind} value={option.kind}>
                    {option.label}
                  </option>
                ))}
              </TextField>
              {action.driverScoped &&
              action.serverCommand &&
              'seconds' in action.serverCommand ? (
                <TextField
                  size="small"
                  type="number"
                  sx={{ width: 84 }}
                  value={action.serverCommand.seconds}
                  inputProps={{
                    min: 1,
                    'aria-label': `Action ${index + 1} server penalty seconds`,
                  }}
                  onChange={(changeEvent) =>
                    replaceAt(index, {
                      serverCommand: serverCommandOfKind(
                        action.serverCommand?.kind ?? '',
                        changeEvent.target.value,
                      ),
                    })
                  }
                  disabled={disabled}
                />
              ) : null}
              {/*
                "Does this apply to one driver, or to the incident?" — the check
                that stops a penalty being recorded against a two-car incident
                with nobody named. Visible rather than inferred from the wording,
                because no rule about the text could get this right.
              */}
              <Tooltip
                title={
                  action.driverScoped
                    ? 'A call against one driver. Needs a driver selected before it can be used, and the record names them.'
                    : 'A finding about the incident as a whole. Records no driver.'
                }
              >
                <Stack alignItems="center" sx={{ minWidth: 92 }}>
                  <Switch
                    size="small"
                    checked={action.driverScoped}
                    onChange={(_changeEvent, checked) =>
                      replaceAt(index, { driverScoped: checked })
                    }
                    slotProps={{
                      input: {
                        'aria-label': `Action ${index + 1} applies to one driver`,
                      },
                    }}
                    disabled={disabled}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {action.driverScoped ? 'One driver' : 'Incident'}
                  </Typography>
                </Stack>
              </Tooltip>
              <IconButton
                size="small"
                aria-label={`Move action ${index + 1} up`}
                onClick={() => moveBy(index, -1)}
                disabled={disabled || index === 0}
              >
                <ArrowUpwardIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                aria-label={`Move action ${index + 1} down`}
                onClick={() => moveBy(index, 1)}
                disabled={disabled || index === actions.length - 1}
              >
                <ArrowDownwardIcon fontSize="small" />
              </IconButton>
              {/*
                The last row cannot be removed. An empty tariff would leave the
                dossier with nothing to press, and silently falling back to the
                shipped set instead would look like the delete had failed.
              */}
              <Tooltip
                title={
                  actions.length === 1
                    ? 'At least one action is needed. Use "Revert to default" to start over.'
                    : `Remove "${action.label}"`
                }
              >
                <span>
                  <IconButton
                    size="small"
                    aria-label={`Remove action ${index + 1}`}
                    onClick={() =>
                      onChange(actions.filter((_entry, at) => at !== index))
                    }
                    disabled={disabled || actions.length === 1}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          );
        })}
      </Stack>

      <Button
        size="small"
        startIcon={<AddIcon />}
        sx={{ mt: 1.5 }}
        onClick={() =>
          onChange([
            ...actions,
            /*
              New actions default to a call against a driver. An action wrongly
              marked driver-scoped asks for a target that was not needed; the
              other way round writes a penalty nobody can act on.
            */
            { id: newActionId(), label: '', driverScoped: true },
          ])
        }
        disabled={disabled}
      >
        Add action
      </Button>

      {/*
        In the same box as the actions because it is the same subject: what
        this steward says in the session's chat. The autosend switch is not
        here — it sits on the live screen beside the message it governs.
      */}
      <Box
        sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          Steward Announcement
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mb: 1 }}
        >
          The message the Announce button on the live screen posts to the
          in-game chat. Write {STEWARD_NAME_PLACEHOLDER} where your steward name
          should go. Left blank, the shipped wording is used.
        </Typography>
        <TextField
          size="small"
          fullWidth
          value={announcement}
          placeholder={DEFAULT_STEWARD_ANNOUNCEMENT}
          helperText={`Sends: ${resolveStewardAnnouncement(announcement, stewardName)}`}
          inputProps={{
            maxLength: MAX_STEWARD_ANNOUNCEMENT_LENGTH,
            'aria-label': 'Steward announcement message',
          }}
          onChange={(changeEvent) =>
            onChangeAnnouncement(changeEvent.target.value)
          }
          disabled={disabled}
        />
      </Box>
    </Box>
  );
};
