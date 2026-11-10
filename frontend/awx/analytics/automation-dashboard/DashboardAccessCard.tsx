import {
  IPageAction,
  ITableColumn,
  IToolbarFilter,
  PageActionSelection,
  PageActionType,
  PageFormSubmitHandler,
  PageTable,
  TextCell,
  ToolbarFilterType,
  usePageDialog,
} from '@ansible/ansible-ui-framework';
import { PageFormAsyncSingleSelect } from '@ansible/ansible-ui-framework/PageForm/Inputs/PageFormAsyncSingleSelect';
import {
  PageAsyncSelectOptionsFn,
  PageAsyncSelectQueryOptions,
} from '@ansible/ansible-ui-framework/PageInputs/PageAsyncSelectOptions';
import { PageMultiSelectList } from '@ansible/ansible-ui-framework/PageTable/PageMultiSelectList';
import { AsyncQueryLabel } from '@ansible/common-ui/AsyncQueryLabel';
import { UserAssignment } from '@ansible/common-ui/access/interfaces/UserAssignment';
import { postRequest, requestDelete, requestGet } from '@ansible/common-ui/crud/Data';
import { idKeyFn } from '@ansible/common-ui/utils/nameKeyFn';
import {
  ButtonVariant,
  Content,
  ContentVariants,
  Modal,
  ModalBody,
  ModalHeader,
  ModalVariant,
  Title,
} from '@patternfly/react-core';
import { FieldPathByValue } from 'react-hook-form';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { metricsAPI } from '../../common/api/metrics-utils';
import { AwxPageForm } from '../../common/AwxPageForm';
import { useAwxBulkConfirmation } from '../../common/useAwxBulkConfirmation';
import { useAwxView } from '../../common/useAwxView';
import { useCanEditAutomationAnalyticsSettings } from './common/useCanEditAutomationAnalyticsSettings';

interface MetricsUser {
  id: number;
  username: string;
}

interface MetricsOrganization {
  id: number;
  name: string;
}

interface DashboardRole {
  id: number;
  name: string;
  description: string;
}

interface MetricsItemsResponse<T> {
  count: number;
  results: T[];
}

interface DashboardAccessFormValues {
  user: number;
  organization: number;
}

type MetricsSelectItem = { id: number } & Partial<Record<'username' | 'name', string>>;

/** Query options for an async single-select backed by a metrics-service endpoint (keyset pagination). */
function useQueryMetricsSelectOptions<ItemT extends MetricsSelectItem>(
  url: string,
  labelKey: 'username' | 'name'
): PageAsyncSelectOptionsFn<number> {
  return useCallback(
    async (queryOptions: PageAsyncSelectQueryOptions) => {
      let requestUrl = `${url}?order_by=${labelKey}`;
      if (queryOptions.next) {
        requestUrl += `&${labelKey}__gt=${encodeURIComponent(String(queryOptions.next))}`;
      }
      if (queryOptions.search) {
        requestUrl += `&${labelKey}__icontains=${encodeURIComponent(queryOptions.search)}`;
      }
      const itemsResponse = await requestGet<MetricsItemsResponse<ItemT>>(requestUrl);
      const lastItem = itemsResponse.results[itemsResponse.results.length - 1];
      return {
        remaining: itemsResponse.count - itemsResponse.results.length,
        options: itemsResponse.results.map((item) => ({
          label: item[labelKey] ?? '',
          value: item.id,
        })),
        next: lastItem?.[labelKey] ?? '',
      };
    },
    [labelKey, url]
  );
}

export function DashboardAccessCard() {
  const { t } = useTranslation();
  const [_, setDialog] = usePageDialog();
  const canEdit = useCanEditAutomationAnalyticsSettings();
  const bulkAction = useAwxBulkConfirmation<UserAssignment>();

  const tableColumns = useMemo<ITableColumn<UserAssignment>[]>(
    () => [
      {
        header: t('Username'),
        cell: (assignment) => <TextCell text={assignment.summary_fields.user.username} />,
        card: 'name',
        list: 'name',
        maxWidth: 200,
      },
      {
        header: t('Organization'),
        cell: (assignment) => <TextCell text={assignment.summary_fields.content_object.name} />,
      },
      {
        header: t('Role'),
        type: 'description',
        value: (assignment) => assignment.summary_fields.role_definition.name,
        sort: 'role_definition__name',
      },
    ],
    [t]
  );

  const toolbarFilters = useMemo<IToolbarFilter[]>(
    () => [
      {
        key: 'username',
        label: t('Username'),
        type: ToolbarFilterType.SingleText,
        query: 'user__username__icontains',
        comparison: 'contains',
      },
    ],
    [t]
  );

  const view = useAwxView<UserAssignment>({
    url: metricsAPI`/role_user_assignments/`,
    queryParams: {
      content_type__api_slug: 'shared.organization',
      role_definition__name__icontains: 'Dashboard',
    },
    toolbarFilters,
    tableColumns,
    disableQueryString: true,
  });

  const removeAccess = useCallback(
    (assignments: UserAssignment[]) => {
      bulkAction({
        title: t('Remove dashboard access'),
        confirmText: t('Yes, I confirm that I want to remove these {{count}} assignments.', {
          count: assignments.length,
        }),
        actionButtonText: t('Remove dashboard access'),
        items: assignments,
        keyFn: idKeyFn,
        isDanger: true,
        confirmationColumns: [
          {
            header: t('Username'),
            cell: (assignment: UserAssignment) => assignment.summary_fields.user.username,
          },
          {
            header: t('Organization'),
            cell: (assignment: UserAssignment) => assignment.summary_fields.content_object.name,
          },
          {
            header: t('Role'),
            cell: (assignment: UserAssignment) => assignment.summary_fields.role_definition.name,
          },
        ],
        actionColumns: [
          {
            header: t('Username'),
            cell: (assignment: UserAssignment) => assignment.summary_fields.user.username,
          },
          {
            header: t('Role'),
            cell: (assignment: UserAssignment) => assignment.summary_fields.role_definition.name,
          },
        ],
        onComplete: () => void view.refresh(),
        actionFn: (assignment: UserAssignment, signal: AbortSignal) =>
          requestDelete(metricsAPI`/role_user_assignments/${assignment.id}/`, signal),
      });
    },
    [bulkAction, t, view]
  );

  const toolbarActions = useMemo<IPageAction<object>[]>(
    () => [
      {
        type: PageActionType.Button,
        selection: PageActionSelection.None,
        variant: ButtonVariant.primary,
        label: t('Add dashboard access'),
        onClick: () =>
          setDialog(
            <DashboardAccessModal
              onClose={() => setDialog(undefined)}
              onSaved={() => void view.refresh()}
            />
          ),
        isPinned: true,
        isHidden: () => !canEdit,
      },
    ],
    [canEdit, setDialog, t, view]
  );

  const rowActions = useMemo<IPageAction<UserAssignment>[]>(
    () => [
      {
        type: PageActionType.Button,
        selection: PageActionSelection.Single,
        label: t('Remove dashboard access'),
        onClick: (assignment: UserAssignment) => removeAccess([assignment]),
        isHidden: () => !canEdit,
      },
    ],
    [canEdit, removeAccess, t]
  );

  return (
    <>
      <Title headingLevel={'h2'}>{t('Dashboard access')}</Title>
      <Content component={ContentVariants.p}>
        {t(
          'Organization-scoped roles that grant access to the Automation Dashboard for a single organization.'
        )}
      </Content>
      <PageTable<UserAssignment>
        {...view}
        tableColumns={tableColumns}
        toolbarFilters={toolbarFilters}
        toolbarActions={toolbarActions}
        rowActions={rowActions}
        errorStateTitle={t('Error loading dashboard access')}
        emptyStateTitle={t('No dashboard access')}
        emptyStateDescription={t(
          'Users with an organization dashboard role will be listed here.'
        )}
      />
    </>
  );
}

function DashboardAccessModal(props: Readonly<{ onClose: () => void; onSaved: () => void }>) {
  const { t } = useTranslation();
  const userQueryOptions = useQueryMetricsSelectOptions<MetricsUser>(
    metricsAPI`/users/`,
    'username'
  );
  const organizationQueryOptions = useQueryMetricsSelectOptions<MetricsOrganization>(
    metricsAPI`/organizations/`,
    'name'
  );

  const tableColumns = useMemo<ITableColumn<DashboardRole>[]>(
    () => [
      {
        header: t('Name'),
        cell: (role) => <TextCell text={role.name} />,
        card: 'name',
        list: 'name',
        sort: 'name',
      },
      {
        header: t('Description'),
        cell: (role) => role.description && <TextCell text={role.description} />,
        card: 'description',
        list: 'description',
      },
    ],
    [t]
  );

  // Only the managed dashboard roles (viewer/editor); other organization roles are
  // gateway-managed and would be removed by the next JWT claims sync.
  const view = useAwxView<DashboardRole>({
    url: metricsAPI`/role_definitions/`,
    queryParams: {
      content_type__api_slug: 'shared.organization',
      name__icontains: 'Dashboard',
    },
    tableColumns,
    disableQueryString: true,
  });

  const handleSubmit: PageFormSubmitHandler<DashboardAccessFormValues> = async (values) => {
    const roles = view.selectedItems ?? [];
    if (!roles.length) {
      throw new Error(t('Select at least one role.'));
    }
    for (const role of roles) {
      await postRequest(metricsAPI`/role_user_assignments/`, {
        user: Number(values.user),
        role_definition: role.id,
        content_type: 'shared.organization',
        object_id: Number(values.organization),
      });
    }
    props.onSaved();
    props.onClose();
  };

  return (
    <Modal
      aria-label={t('Add dashboard access')}
      variant={ModalVariant.large}
      isOpen
      onClose={props.onClose}
      disableFocusTrap={process.env.NODE_ENV === 'test'}
    >
      <ModalHeader title={t('Add dashboard access')} />
      <ModalBody>
        <AwxPageForm<DashboardAccessFormValues>
          submitText={t('Save')}
          onSubmit={handleSubmit}
          onCancel={props.onClose}
          disableGrid
        >
          <PageFormAsyncSingleSelect<
            DashboardAccessFormValues,
            FieldPathByValue<DashboardAccessFormValues, number>
          >
            name="user"
            id="dashboard-access-user"
            label={t('User')}
            placeholder={t('Select user')}
            queryOptions={userQueryOptions}
            queryPlaceholder={t('Loading users...')}
            queryErrorText={t('Error loading users')}
            queryLabel={(id: number) => (
              <AsyncQueryLabel id={id} url={metricsAPI`/users/`} field="username" />
            )}
            isRequired
          />
          <PageFormAsyncSingleSelect<
            DashboardAccessFormValues,
            FieldPathByValue<DashboardAccessFormValues, number>
          >
            name="organization"
            id="dashboard-access-organization"
            label={t('Organization')}
            placeholder={t('Select organization')}
            queryOptions={organizationQueryOptions}
            queryPlaceholder={t('Loading organizations...')}
            queryErrorText={t('Error loading organizations')}
            queryLabel={(id: number) => (
              <AsyncQueryLabel id={id} url={metricsAPI`/organizations/`} />
            )}
            isRequired
          />
          <PageMultiSelectList
            view={view}
            tableColumns={tableColumns}
            toolbarFilters={[]}
            labelForSelectedItems={t('Selected roles')}
            errorStateTitle={t('Error loading roles')}
          />
        </AwxPageForm>
      </ModalBody>
    </Modal>
  );
}
